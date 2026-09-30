// Everything the loop widget decides, other than drawing. The whole movement
// runs in detailed mode, regulated, from full wind: the mainspring drives the
// glide wheel, the IC compares it with the crystal's reference at every tick,
// and sets how much of the time the coil is shorted. The reader can switch
// regulation off, and knock the watch to speed the wheel up or slow it down
// by the nominal shock (PHYSICS.md, `SHOCK_DELTA_OMEGA_RAD_S`). A scope
// traces the last few seconds of speed, phase error, and brake duty, so the
// reader sees each knock pushed back, and the wheel run away without the loop.
//
// The wheel is drawn as the reference sees it: turned by the phase error, so
// a locked wheel stands still with its north pole under the coil, as it is at
// every reference tick, and a knocked one swings away and back (decision 36).
//
// The physics is `src/sim/detailed.ts`. This module decides when to step it,
// what to record, and how to say it.

import { MAX_FRAME_DT_S } from '../../runtime/scheduler.ts';
import { createAveragedState, detailedFromAveraged } from '../../sim/averaged.ts';
import { advanceSteps, applyShock, phaseErrorRad, realignReference, sampleOf } from '../../sim/detailed.ts';
import { maxBrakeTorqueNm } from '../../sim/generator.ts';
import { windFraction } from '../../sim/mainspring.ts';
import { isLocked } from '../../sim/metrics.ts';
import { SHOCK_DELTA_OMEGA_RAD_S } from '../../sim/params.ts';
import { cyclesPerReferenceTick, cyclesPerStep } from '../../sim/quartz.ts';
import type { Sample, SimControls, SimParams, SimState } from '../../sim/types.ts';
import { TAU, radSToRevS } from '../../sim/units.ts';
import { UNIT_SPACE, formatDuration, formatPercent, withUnit } from '../shared/format.ts';
import type { Readout } from '../shared/shell.ts';

/** The scope shows this much sim time, s. Long enough to hold a relock from a knock (within 3.0 s, test 6) with the knock still in view. */
export const SCOPE_WINDOW_S = 8;

/**
 * A point is recorded every this many sim steps: 64 steps of 1/4,096 s is
 * 1/64 s, eight points a reference period and 512 across the scope, about
 * one and a half a pixel on a phone.
 */
export const SAMPLE_EVERY_STEPS = 64;

/**
 * When the widget is still (paused, offscreen, or a reduced-motion static
 * frame), sim time does not move, so an action would never show its effect.
 * Instead the sim runs on this long at once, and the still frame shows the
 * response. Six seconds holds a relock from a knock and most of one after
 * regulation comes back on, and leaves two seconds of what came before on
 * the scope.
 */
export const STILL_RESPONSE_S = 6;

/**
 * The scope's scales, zoomed on the operating point at full wind, where the
 * widget runs, so a knock fills a good part of each strip; anything past an
 * edge is pinned there, drawn faint, and marked "off scale".
 *
 * - Speed, the target ± 4 rev/s, 4 to 12 rev/s: a ±2 rev/s knock is a
 *   quarter of the strip. The unregulated wheel's 30 rev/s is off the top.
 * - Phase error, ±90°: a knock at full wind swings it at most +46.7° or
 *   −65.9°, depending on when it lands (PHYSICS.md, D12). A relock after regulation comes back, and any time
 *   with regulation off, runs off it.
 * - Brake duty, 0 to 30 %: the steady 11.2 % a little over a third of the
 *   way up, and a knock's 3 % to 17 % swing clear of both edges. Full brake,
 *   as the loop pulls a runaway back, is off the top.
 */
export const SPEED_SCALE_HALF_REV_S = 4;
export const PHASE_SCALE_DEG = 90;
export const DUTY_SCALE_MAX = 0.3;

const DEG_PER_RAD = 360 / TAU;

export interface ScopePoint {
  timeS: number;
  omegaRadS: number;
  /** Phase error the IC measures, rad. Zero while the IC is off. */
  phaseErrorRad: number;
  /** The duty the coil is actually shorted at: zero while regulation is off or the IC is off. */
  duty: number;
}

/** Something the reader did, marked on the scope where it happened. */
export interface ScopeEvent {
  timeS: number;
  kind: 'faster' | 'slower' | 'off' | 'on';
}

export interface LoopState {
  sim: SimState;
  /** Sim time too short for another step, carried to the next frame. */
  carryS: number;
  regulation: boolean;
  /** Scope points, oldest first, covering the last `SCOPE_WINDOW_S` and a little more. */
  history: readonly ScopePoint[];
  events: readonly ScopeEvent[];
  /** The sample at the last reference tick, for judging lock over the period since. Null after a restart of the reference. */
  lastTick: Sample | null;
  /** Sim time lock was gained, and held since; null while not locked. */
  lockedSinceS: number | null;
  /** Glide wheel angle and sim time when the hands were set right, at mount. */
  originAngleRad: number;
  originTimeS: number;
  /** How far the drawn wheel (the phase error) turned over the last frame, rad, for the motion blur. Zero before the first frame. */
  sweepRad: number;
}

function controls(state: LoopState): SimControls {
  return { brakeEnabled: state.regulation };
}

function scopePoint(s: SimState, regulation: boolean, params: SimParams): ScopePoint {
  const reg = s.regulator;
  return {
    timeS: s.timeS,
    omegaRadS: s.rotorOmegaRadS,
    phaseErrorRad: phaseErrorRad(s, params),
    duty: regulation && reg.icOn ? reg.duty : 0,
  };
}

/** Points older than the scope's window, less one point so the trace reaches its left edge, are dropped. */
function trim(points: readonly ScopePoint[], nowS: number): ScopePoint[] {
  const from = nowS - SCOPE_WINDOW_S;
  const first = points.findIndex((p) => p.timeS >= from);
  return first <= 0 ? [...points] : points.slice(first - 1);
}

/**
 * Step the movement in whole sim steps, recording a scope point every
 * `SAMPLE_EVERY_STEPS` and judging lock at every reference tick, over the
 * period since the last one, as test 2 does (`isLocked`). It steps in runs
 * that end on the next sample or tick, whichever comes first, so no boundary
 * is stepped over and the state is copied once a run rather than once a step.
 */
function run(state: LoopState, steps: number, params: SimParams): LoopState {
  const tickCycles = cyclesPerReferenceTick(params);
  const stepCycles = cyclesPerStep(params);
  const ctl = controls(state);
  let sim = state.sim;
  let { lastTick, lockedSinceS } = state;
  const added: ScopePoint[] = [];
  let left = steps;
  while (left > 0) {
    const toSample = SAMPLE_EVERY_STEPS - (sim.step % SAMPLE_EVERY_STEPS);
    const toTick = sim.regulator.icOn ? (tickCycles - (sim.regulator.quartzCycles % tickCycles)) / stepCycles : left;
    const n = Math.max(1, Math.min(left, toSample, toTick));
    sim = advanceSteps(sim, params, ctl, n);
    left -= n;
    const reg = sim.regulator;
    if (reg.icOn && reg.quartzCycles > 0 && reg.quartzCycles % tickCycles === 0) {
      const tick = sampleOf(sim, params);
      const locked = lastTick !== null && isLocked(lastTick, tick, params);
      lockedSinceS = locked ? (lockedSinceS ?? tick.timeS) : null;
      lastTick = tick;
    } else if (!reg.icOn) {
      lastTick = null;
      lockedSinceS = null;
    }
    if (sim.step % SAMPLE_EVERY_STEPS === 0) added.push(scopePoint(sim, state.regulation, params));
  }
  const history = added.length === 0 ? state.history : trim([...state.history, ...added], sim.timeS);
  const events = state.events.filter((e) => e.timeS >= sim.timeS - SCOPE_WINDOW_S);
  return { ...state, sim, history, events, lastTick, lockedSinceS };
}

export interface LoopOptions {
  /** Fraction of full wind, 0 to 1. Default: fully wound, as in the intro. */
  windFraction?: number;
}

/**
 * The movement at full wind, already regulated: the steady state averaged
 * mode gives, carried into detailed mode locked from its first tick
 * (`detailedFromAveraged`, as the intro does; `tests/sim/handover.test.ts`).
 * The scope opens full of that steady state, a flat trace at 8 rev/s, zero
 * phase error, and the steady duty, as if the watch had been running for a
 * while, rather than empty. Those points are the settled state itself, not a
 * run: running detailed mode for the window would cost about 0.1 s at mount
 * to draw lines that are flat to within a pixel.
 */
export function initialLoopState(params: SimParams, options: LoopOptions = {}): LoopState {
  const settledAveraged = createAveragedState(params, { windFraction: options.windFraction ?? 1 });
  const sim = detailedFromAveraged(settledAveraged, params);
  const settled = scopePoint(sim, true, params);
  const sampleS = SAMPLE_EVERY_STEPS * params.stepS;
  const count = Math.round(SCOPE_WINDOW_S / sampleS);
  const history = Array.from({ length: count + 1 }, (_, k) => ({
    ...settled,
    timeS: sim.timeS - (count - k) * sampleS,
  }));
  return {
    sim,
    carryS: 0,
    regulation: true,
    history,
    events: [],
    // The reference's first count is a tick in all but name: lock is judged from it.
    lastTick: sim.regulator.icOn ? sampleOf(sim, params) : null,
    lockedSinceS: settledAveraged.regime === 'regulated' ? sim.timeS : null,
    originAngleRad: sim.rotorAngleRad,
    originTimeS: sim.timeS,
    sweepRad: 0,
  };
}

/**
 * Advance by `dtS` of page time, which is sim time: the loop is shown at real
 * time. The scheduler already clamps a frame to `MAX_FRAME_DT_S`; this clamps
 * again, so no caller can ask for hours of 4,096 Hz steps in one frame.
 */
export function advanceLoop(state: LoopState, dtS: number, params: SimParams): LoopState {
  const pageS = Number.isFinite(dtS) ? Math.min(MAX_FRAME_DT_S, Math.max(0, dtS)) : dtS > 0 ? MAX_FRAME_DT_S : 0;
  const totalS = pageS + state.carryS;
  const steps = Math.floor(totalS / params.stepS);
  const before = phaseErrorRad(state.sim, params);
  const next = run(state, steps, params);
  return {
    ...next,
    carryS: totalS - steps * params.stepS,
    sweepRad: phaseErrorRad(next.sim, params) - before,
  };
}

/** While the widget is still, run on so the still frame shows what the action did (see `STILL_RESPONSE_S`). */
function respond(state: LoopState, live: boolean, params: SimParams): LoopState {
  if (live) return state;
  return { ...run(state, Math.round(STILL_RESPONSE_S / params.stepS), params), sweepRad: 0 };
}

/**
 * Knock the watch: the glide wheel's speed jumps by the nominal shock, up or
 * down, as in test 6.
 */
export function knock(state: LoopState, direction: 1 | -1, live: boolean, params: SimParams): LoopState {
  const sim = applyShock(state.sim, direction * SHOCK_DELTA_OMEGA_RAD_S, params);
  const event: ScopeEvent = { timeS: sim.timeS, kind: direction > 0 ? 'faster' : 'slower' };
  return respond({ ...state, sim, events: [...state.events, event] }, live, params);
}

/**
 * Switch regulation on or off. Off, the coil is never shorted and the wheel
 * runs away; the IC still counts, so the phase error it would act on keeps
 * growing. On again, the reference restarts from wherever the wheel is, as a
 * power-on does (decision 19), rather than the loop trying to claw back every
 * turn the wheel gained while it ran free (decision 36). The hands keep what
 * they gained: `handsAheadS` still counts it.
 */
export function setRegulation(state: LoopState, on: boolean, live: boolean, params: SimParams): LoopState {
  if (on === state.regulation) return state;
  const sim = on ? realignReference(state.sim) : state.sim;
  const event: ScopeEvent = { timeS: sim.timeS, kind: on ? 'on' : 'off' };
  const next: LoopState = {
    ...state,
    sim,
    regulation: on,
    events: [...state.events, event],
    lastTick: on ? null : state.lastTick,
    lockedSinceS: null,
  };
  return respond(next, live, params);
}

// What the reader is told ---------------------------------------------------------

export type LoopStatus = 'locked' | 'locking' | 'regulation off' | 'no power';

export function status(state: LoopState): LoopStatus {
  if (!state.sim.regulator.icOn) return 'no power';
  if (!state.regulation) return 'regulation off';
  return state.lockedSinceS === null ? 'locking' : 'locked';
}

/** How long the wheel has been locked, s; zero while it is not. */
export function lockedForS(state: LoopState): number {
  return state.lockedSinceS === null ? 0 : state.sim.timeS - state.lockedSinceS;
}

/** The duty the coil is shorted at right now. */
export function currentDuty(state: LoopState): number {
  const reg = state.sim.regulator;
  return state.regulation && reg.icOn ? reg.duty : 0;
}

/**
 * How far the hands are ahead of true time, s. They are geared to the glide
 * wheel, so this is the turns it has made since mount, read at 8 rev/s,
 * against the time that has passed. While the loop holds, it is the phase
 * error over ω₀; a spell with regulation off adds what the runaway gained,
 * which the restarted reference then forgives but the hands do not.
 */
export function handsAheadS(state: LoopState, params: SimParams): number {
  const shownS = (state.sim.rotorAngleRad - state.originAngleRad) / params.rotorTargetOmegaRadS;
  return shownS - (state.sim.timeS - state.originTimeS);
}

/** A plus sign on a value that shows as positive, as a signed readout needs: "+12.3°". Zero and negatives keep their own sign. */
function signed(text: string, value: number, decimals: number): string {
  return Number(value.toFixed(decimals)) > 0 ? `+${text}` : text;
}

/** A phase error in degrees within a turn, "+12.3°"; past a turn, in turns, "+48.6 turns". */
export function formatPhase(rad: number): string {
  const deg = rad * DEG_PER_RAD;
  if (Math.abs(deg) < 359.95) return signed(withUnit(deg, 1, '°').replace(UNIT_SPACE, ''), deg, 1);
  return signed(withUnit(rad / TAU, 1, 'turns'), rad, 1);
}

/**
 * A small signed time offset: milliseconds under a second, "+3.1 ms", and
 * seconds above, "+6.07 s". A plus sign for ahead, a minus for behind.
 */
export function formatOffset(seconds: number): string {
  if (Math.abs(seconds) < 1) return signed(withUnit(seconds * 1e3, 1, 'ms'), seconds * 1e3, 1);
  return signed(withUnit(seconds, 2, 's'), seconds, 2);
}

export function readouts(state: LoopState, params: SimParams): Readout[] {
  return [
    { label: 'Glide wheel speed', role: 'speed', value: withUnit(radSToRevS(state.sim.rotorOmegaRadS), 3, 'rev/s') },
    { label: 'Phase error', role: 'ic', value: formatPhase(phaseErrorRad(state.sim, params)) },
    { label: 'Brake duty', role: 'brake', value: formatPercent(currentDuty(state)) },
    {
      label: 'Brake torque',
      role: 'brake',
      value: withUnit(currentDuty(state) * maxBrakeTorqueNm(state.sim.rotorOmegaRadS, params) * 1e9, 1, 'nN·m'),
    },
    { label: 'Locked for', value: formatDuration(lockedForS(state)) },
    { label: 'Hands vs true time', role: 'hands', value: formatOffset(handsAheadS(state, params)) },
    {
      label: 'Mainspring wound',
      role: 'mainspring',
      value: formatPercent(windFraction(state.sim.barrelAngleRad, params)),
    },
  ] as const;
}

// The scope ------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a sim time lands across the scope: now at the right edge, `SCOPE_WINDOW_S` ago at the left. */
export function scopeX(box: Box, timeS: number, nowS: number): number {
  const f = 1 - (nowS - timeS) / SCOPE_WINDOW_S;
  return box.x + box.width * Math.max(0, Math.min(1, f));
}

/**
 * Where a value lands in a strip running from `min` at the bottom to `max`
 * at the top, and whether it was off the scale and pinned to an edge.
 */
export function stripY(box: Box, value: number, min: number, max: number): { y: number; clipped: boolean } {
  const f = (value - min) / (max - min);
  const clipped = !(f >= 0 && f <= 1);
  const c = Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
  return { y: box.y + box.height * (1 - c), clipped };
}

/** A stretch of a trace drawn in one style: full, or faint where both ends are off the scale. */
export interface TraceRun {
  faint: boolean;
  points: { x: number; y: number }[];
}

/**
 * A trace split into runs of one style, each to be stroked as a single path.
 * A segment is faint when both its ends are pinned off the scale. Stroking
 * each of the scope's 1,536 segments (512 a strip) on its own cost the loop
 * widget about half its frame (decision 39). A run shares its end point with
 * the next, so the line is unbroken where the style changes.
 */
export function traceRuns(points: readonly { x: number; y: number; clipped: boolean }[]): TraceRun[] {
  const runs: TraceRun[] = [];
  let current: TraceRun | undefined;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const faint = a.clipped && b.clipped;
    if (!current || current.faint !== faint) {
      current = { faint, points: [{ x: a.x, y: a.y }] };
      runs.push(current);
    }
    current.points.push({ x: b.x, y: b.y });
  }
  return runs;
}

export type Channel = 'speed' | 'phase' | 'duty';

/** A scope point's value on one strip, in the strip's own unit: rev/s, degrees, or percent. */
export function channelValue(p: ScopePoint, channel: Channel): number {
  if (channel === 'speed') return radSToRevS(p.omegaRadS);
  if (channel === 'phase') return p.phaseErrorRad * DEG_PER_RAD;
  return p.duty * 100;
}

export interface ScopeChannel {
  channel: Channel;
  title: string;
  min: number;
  max: number;
  grid: readonly number[];
  /** The value the loop holds this channel at, drawn dashed in the reference's colour: the target speed, zero phase error. Null for duty, which has no target. */
  target: number | null;
}

/** The scope's three strips, top to bottom, in their own units. */
export function scopeChannels(params: SimParams): readonly ScopeChannel[] {
  const targetRevS = radSToRevS(params.rotorTargetOmegaRadS);
  const dutyMax = DUTY_SCALE_MAX * 100;
  return [
    {
      channel: 'speed',
      title: 'Speed, rev/s',
      min: targetRevS - SPEED_SCALE_HALF_REV_S,
      max: targetRevS + SPEED_SCALE_HALF_REV_S,
      grid: [targetRevS - SPEED_SCALE_HALF_REV_S, targetRevS, targetRevS + SPEED_SCALE_HALF_REV_S],
      target: targetRevS,
    },
    {
      channel: 'phase',
      title: 'Phase error, °',
      min: -PHASE_SCALE_DEG,
      max: PHASE_SCALE_DEG,
      grid: [-PHASE_SCALE_DEG, 0, PHASE_SCALE_DEG],
      target: 0,
    },
    { channel: 'duty', title: 'Brake duty, %', min: 0, max: dutyMax, grid: [0, dutyMax / 2, dutyMax], target: null },
  ];
}

/** Time labels under the scope, every 2 s: "−8 s" … "now". */
export function timeLabels(): { agoS: number; text: string }[] {
  const out: { agoS: number; text: string }[] = [];
  for (let ago = SCOPE_WINDOW_S; ago >= 0; ago -= 2) {
    out.push({ agoS: ago, text: ago === 0 ? 'now' : withUnit(-ago, 0, 's') });
  }
  return out;
}

/** What an event is called on the scope. */
export function eventLabel(e: ScopeEvent): string {
  switch (e.kind) {
    case 'faster':
      return 'knock +';
    case 'slower':
      return 'knock −';
    case 'off':
      return 'off';
    case 'on':
      return 'on';
  }
}

// Layout ---------------------------------------------------------------------------

export interface LoopLayout {
  wheel: { cx: number; cy: number; radius: number };
  coil: Box;
  /** Where the status line goes, under the wheel's two-line caption. */
  statusY: number;
  strips: Box[];
  wide: boolean;
  height: number;
}

const MARGIN_PX = 12;
/** Below this width the scope goes under the wheel. */
export const WIDE_MIN_PX = 520;
const WIDE_WHEEL_COLUMN = 0.34;
const MAX_RADIUS_PX = 60;
const COIL_WIDTH = 0.9;
const COIL_HEIGHT = 0.5;
/** Room between coil and wheel for the reference mark. */
const COIL_GAP = 0.3;
/** Under the wheel: its name, the caption saying how it is seen, then the status. */
const CAPTION_PX = 36;
const STATUS_PX = 22;
const AXIS_PX = 34;
/** Room over each strip for its title, clear of the top axis label. */
const STRIP_TITLE_PX = 26;
const STRIP_HEIGHT_PX = 58;
const STRIP_GAP_PX = 6;
const TIME_AXIS_PX = 20;
/** Speed, phase error, and duty. */
const STRIP_COUNT = 3;

function wheelGroup(cx: number, top: number, radius: number) {
  const coilHeight = radius * COIL_HEIGHT;
  const cy = top + coilHeight + radius * COIL_GAP + radius;
  return {
    wheel: { cx, cy, radius },
    coil: { x: cx - (radius * COIL_WIDTH) / 2, y: top, width: radius * COIL_WIDTH, height: coilHeight },
    statusY: cy + radius + CAPTION_PX + STATUS_PX / 2,
    bottom: cy + radius + CAPTION_PX + STATUS_PX,
  };
}

function strips(x: number, top: number, width: number): { strips: Box[]; bottom: number } {
  const out: Box[] = [];
  let y = top;
  for (let i = 0; i < STRIP_COUNT; i++) {
    y += STRIP_TITLE_PX;
    out.push({ x, y, width, height: STRIP_HEIGHT_PX });
    y += STRIP_HEIGHT_PX + STRIP_GAP_PX;
  }
  return { strips: out, bottom: y - STRIP_GAP_PX + TIME_AXIS_PX };
}

export function loopLayout(cssWidth: number): LoopLayout {
  const width = Math.max(0, cssWidth);
  if (width >= WIDE_MIN_PX) {
    const column = width * WIDE_WHEEL_COLUMN;
    const radius = Math.max(0, Math.min(MAX_RADIUS_PX, column / 2 - MARGIN_PX));
    const g = wheelGroup(column / 2, MARGIN_PX, radius);
    const x = column + AXIS_PX;
    const s = strips(x, MARGIN_PX, Math.max(0, width - MARGIN_PX - x));
    return {
      wheel: g.wheel,
      coil: g.coil,
      statusY: g.statusY,
      strips: s.strips,
      wide: true,
      height: Math.ceil(Math.max(g.bottom, s.bottom) + MARGIN_PX),
    };
  }
  const radius = Math.max(0, Math.min(MAX_RADIUS_PX * 0.8, width / 4 - MARGIN_PX));
  const g = wheelGroup(width / 2, MARGIN_PX, radius);
  const s = strips(AXIS_PX, g.bottom + MARGIN_PX, Math.max(0, width - MARGIN_PX - AXIS_PX));
  return {
    wheel: g.wheel,
    coil: g.coil,
    statusY: g.statusY,
    strips: s.strips,
    wide: false,
    height: Math.ceil(s.bottom + MARGIN_PX),
  };
}

export function heightForWidth(cssWidth: number): number {
  return loopLayout(cssWidth).height;
}
