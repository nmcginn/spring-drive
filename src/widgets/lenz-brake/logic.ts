// Everything the lenz-brake widget decides, other than drawing. The reader
// holds the glide wheel at its running speed, 8 rev/s, and lets it go. With
// the mainspring out of the way, only friction and the coil slow it, and a
// plot traces its speed until it stops. The slider sets how much of the time
// the coil is shorted. Shorted, the coil carries the current its EMF drives,
// and that current brakes the wheel (Lenz's law); open, it carries none and
// does nothing. So the more of the time it is shorted, the harder the brake
// and the sooner the wheel stops, and the plot keeps the last few runs, and
// the open-coil run, to compare.
//
// The physics is `src/sim/spindown.ts` (PHYSICS.md, D10): detailed mode's
// integrator and friction, and the duty-averaged brake the regulator will
// work in the loop section (decision 20). This module only decides when to
// step it, what to record, and how to show it.

import {
  coastBrakeTorqueNm,
  coastCoilCurrentA,
  coastFrictionTorqueNm,
  createCoast,
  spinDown,
  stepCoast,
  type CoastState,
  type SpinDownPoint,
} from '../../sim/spindown.ts';
import { maxBrakeTorqueNm } from '../../sim/generator.ts';
import type { SimParams } from '../../sim/types.ts';
import { radSToRevS } from '../../sim/units.ts';
import { formatPercent, formatPlayback, withUnit } from '../shared/format.ts';

/** Slow motion at an eighth of real time, as in the earlier sections: a display rate, not physics. */
export const SLOW_MOTION_RATE = 1 / 8;

/** The slider moves the duty in whole percent. */
export const DUTY_STEP = 0.01;

/**
 * The duty the widget opens at: a quarter of the time shorted. A display
 * choice, not physics. It stops the wheel in about a quarter of the open
 * coil's time, so the first run already differs plainly from the reference.
 */
export const INITIAL_DUTY = 0.25;

/**
 * A point is recorded every this many sim steps: 8 steps of 1/4,096 s is
 * 1/512 s. The fastest run, fully shorted, takes 0.11 s, which is still 56
 * points; the slowest, 1.12 s, is 573.
 */
export const SAMPLE_EVERY_STEPS = 8;

/** Earlier runs kept on the plot besides the current one and the open-coil reference. */
export const HISTORY_RUNS = 3;

/** The plot's time axis ends at the open coil's stop time rounded up to this. */
export const PLOT_TIME_STEP_S = 0.25;

/** A run gives up after this much sim time; with any friction at all the wheel stops long before. */
const MAX_RUN_S = 60;

export interface Run {
  /** The duty the wheel was let go at. */
  duty: number;
  /** Whether the reader moved the slider while the wheel was still turning. */
  varied: boolean;
  points: readonly SpinDownPoint[];
  /** When the wheel stopped, s after it was let go. Null while it turns, or if a new run cut it short. */
  stopS: number | null;
}

export type Phase =
  /** Turned at the release speed by hand, as in the generator section, waiting to be let go. */
  | { kind: 'held'; angleRad: number }
  /** Let go, and coasting or stopped. */
  | { kind: 'coasting'; coast: CoastState; carryS: number; run: Run };

export interface LenzState {
  phase: Phase;
  duty: number;
  /** Earlier runs, oldest first, at most `HISTORY_RUNS`. */
  history: readonly Run[];
  slowMotion: boolean;
  /** The angle the wheel turned through over the last frame, rad, for the motion blur. Zero before the first frame. */
  sweepRad: number;
}

/** The speed the wheel is let go from: the 8 rev/s it runs at in the watch. */
export function releaseOmegaRadS(params: SimParams): number {
  return params.rotorTargetOmegaRadS;
}

export function initialLenzState(): LenzState {
  return { phase: { kind: 'held', angleRad: 0 }, duty: INITIAL_DUTY, history: [], slowMotion: false, sweepRad: 0 };
}

export function rotorAngleRad(state: LenzState): number {
  return state.phase.kind === 'held' ? state.phase.angleRad : state.phase.coast.rotorAngleRad;
}

export function rotorOmegaRadS(state: LenzState, params: SimParams): number {
  return state.phase.kind === 'held' ? releaseOmegaRadS(params) : state.phase.coast.rotorOmegaRadS;
}

export function isStopped(state: LenzState): boolean {
  return state.phase.kind === 'coasting' && state.phase.coast.stoppedAtS !== null;
}

/** Time since the wheel was let go, s: zero while held, and fixed at the stop once it has stopped. */
export function sinceReleaseS(state: LenzState): number {
  if (state.phase.kind === 'held') return 0;
  return state.phase.coast.stoppedAtS ?? state.phase.coast.timeS;
}

/** The run being traced now, if the wheel has been let go. */
export function currentRun(state: LenzState): Run | null {
  return state.phase.kind === 'coasting' ? state.phase.run : null;
}

export function playbackRate(state: LenzState): number {
  return state.slowMotion ? SLOW_MOTION_RATE : 1;
}

export function setSlowMotion(state: LenzState, slowMotion: boolean): LenzState {
  return { ...state, slowMotion };
}

/**
 * Set the fraction of the time the coil is shorted. It acts at once, so a
 * change while the wheel is still turning bends its curve, and the run is
 * marked as varied rather than labelled with a duty it did not keep.
 */
export function setDuty(state: LenzState, duty: number): LenzState {
  const d = Number.isFinite(duty) ? Math.min(1, Math.max(0, duty)) : state.duty;
  if (d === state.duty) return state;
  const p = state.phase;
  if (p.kind === 'coasting' && p.coast.stoppedAtS === null && d !== p.run.duty) {
    return { ...state, duty: d, phase: { ...p, run: { ...p.run, varied: true } } };
  }
  return { ...state, duty: d };
}

/** Step the coast in whole sim steps, recording a point every `SAMPLE_EVERY_STEPS` and at the stop. */
function coastFor(
  phase: Extract<Phase, { kind: 'coasting' }>,
  duty: number,
  durationS: number,
  params: SimParams,
): Extract<Phase, { kind: 'coasting' }> {
  const totalS = durationS + phase.carryS;
  const steps = Math.floor(totalS / params.stepS);
  let coast = phase.coast;
  const added: SpinDownPoint[] = [];
  for (let i = 0; i < steps && coast.stoppedAtS === null; i++) {
    coast = stepCoast(coast, duty, params);
    if (coast.stoppedAtS !== null) added.push({ timeS: coast.stoppedAtS, omegaRadS: 0 });
    else if (coast.step % SAMPLE_EVERY_STEPS === 0) added.push({ timeS: coast.timeS, omegaRadS: coast.rotorOmegaRadS });
  }
  const run: Run =
    added.length === 0 ? phase.run : { ...phase.run, points: [...phase.run.points, ...added], stopS: coast.stoppedAtS };
  return { kind: 'coasting', coast, carryS: coast.stoppedAtS === null ? totalS - steps * params.stepS : 0, run };
}

/**
 * Let the wheel go from the release speed, with the magnet where it is. The
 * run before, finished or not, joins the history. While the widget is
 * animating (`live`), the coast then plays out frame by frame. While it is
 * still (paused, offscreen, or a reduced-motion static frame), sim time does
 * not move, so the whole run is computed at once and the still frame shows
 * where it ends.
 */
export function letGo(state: LenzState, live: boolean, params: SimParams): LenzState {
  const omega = releaseOmegaRadS(params);
  const previous = currentRun(state);
  const history = previous ? [...state.history, previous].slice(-HISTORY_RUNS) : state.history;
  let phase: Extract<Phase, { kind: 'coasting' }> = {
    kind: 'coasting',
    coast: createCoast(omega, rotorAngleRad(state)),
    carryS: 0,
    run: { duty: state.duty, varied: false, points: [{ timeS: 0, omegaRadS: omega }], stopS: null },
  };
  if (!live) phase = coastFor(phase, state.duty, MAX_RUN_S, params);
  return { ...state, phase, history, sweepRad: 0 };
}

/** Advance by `dtS` of page time, which is sim time scaled by the playback rate. */
export function advanceLenz(state: LenzState, dtS: number, params: SimParams): LenzState {
  const pageS = Number.isFinite(dtS) ? Math.max(0, dtS) : 0;
  const simS = pageS * playbackRate(state);
  const p = state.phase;
  if (p.kind === 'held') {
    const sweepRad = releaseOmegaRadS(params) * simS;
    return { ...state, phase: { kind: 'held', angleRad: p.angleRad + sweepRad }, sweepRad };
  }
  if (p.coast.stoppedAtS !== null) return state.sweepRad === 0 ? state : { ...state, sweepRad: 0 };
  const phase = coastFor(p, state.duty, simS, params);
  return { ...state, phase, sweepRad: phase.coast.rotorAngleRad - p.coast.rotorAngleRad };
}

// The open-coil reference and the plot's scales ---------------------------------

/** The wheel let go with the coil open all the time: friction alone stops it. */
export function openCoilRun(params: SimParams): Run {
  const r = spinDown(releaseOmegaRadS(params), 0, params, SAMPLE_EVERY_STEPS * params.stepS, MAX_RUN_S);
  return { duty: 0, varied: false, points: r.points, stopS: r.stopS };
}

/** The plot's time axis: long enough for the open coil's run, the slowest there is, rounded up. */
export function plotWindowS(openCoil: Run): number {
  const stop = openCoil.stopS ?? openCoil.points.at(-1)?.timeS ?? PLOT_TIME_STEP_S;
  return Math.max(PLOT_TIME_STEP_S, Math.ceil(stop / PLOT_TIME_STEP_S) * PLOT_TIME_STEP_S);
}

/** The plot's speed axis: from rest to the release speed, rev/s. */
export function plotSpeedMaxRevS(params: SimParams): number {
  return radSToRevS(releaseOmegaRadS(params));
}

/** Grid lines, from zero up to `max` in steps of `step`, rounded so 0.1 steps do not drift. */
export function gridTicks(max: number, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i * step <= max + step * 1e-9; i++) out.push(Number((i * step).toFixed(6)));
  return out;
}

/** What a run is called on the plot: its duty, "varied" if the reader changed it mid-run, or "open coil". */
export function runLabel(run: Run): string {
  if (run.varied) return 'varied';
  return run.duty === 0 ? 'open coil' : `${formatPercent(run.duty, 0)} shorted`;
}

// Readouts ------------------------------------------------------------------------

/** Torque in nN·m: the glide wheel's torques are tens to hundreds of nanonewton-metres. */
function nNm(torqueNm: number): number {
  return torqueNm * 1e9;
}

export function readouts(state: LenzState, params: SimParams) {
  const omega = rotorOmegaRadS(state, params);
  return [
    { label: 'Glide wheel speed', value: withUnit(radSToRevS(omega), 2, 'rev/s') },
    { label: 'Coil shorted', value: formatPercent(state.duty, 0) },
    { label: 'Brake torque', value: withUnit(nNm(coastBrakeTorqueNm(omega, state.duty, params)), 1, 'nN·m') },
    { label: 'Friction torque', value: withUnit(nNm(coastFrictionTorqueNm(omega, params)), 1, 'nN·m') },
    { label: 'Mean coil current', value: withUnit(coastCoilCurrentA(omega, state.duty, params) * 1e6, 2, 'µA') },
    { label: 'Time since let go', value: withUnit(sinceReleaseS(state), 3, 's') },
    { label: 'Playback', value: `${formatPlayback(playbackRate(state))} real time` },
  ] as const;
}

/** What the slider announces: the duty as a share of the time. */
export function dutyValueText(duty: number): string {
  return `${formatPercent(duty, 0)} of the time`;
}

// Torque arcs ---------------------------------------------------------------------

/**
 * Torque arcs start at 4 o'clock, clear of the wheel's name at 6 and the
 * coil at 12, and run anticlockwise, against the wheel's turning, for at
 * most 120°, which brings the longest up to 12 o'clock under the coil.
 */
export const TORQUE_ARC_START_RAD = (2 * Math.PI) / 3;
export const TORQUE_ARC_MAX_RAD = (2 * Math.PI) / 3;

/**
 * How far around the wheel a torque's arc reaches, rad. The scale is the
 * fully shorted brake at the release speed, the largest torque in the
 * widget, so arcs compare torques at a glance: at 8 rev/s the full brake
 * is 21 times friction.
 */
export function torqueArcRad(torqueNm: number, params: SimParams): number {
  const scale = maxBrakeTorqueNm(releaseOmegaRadS(params), params);
  if (!(torqueNm > 0) || !(scale > 0)) return 0;
  return TORQUE_ARC_MAX_RAD * Math.min(1, torqueNm / scale);
}

// Layout --------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LenzLayout {
  wheel: { cx: number; cy: number; radius: number };
  coil: Box;
  /** The torque arcs' radii, outside the wheel: brake inner, friction outer. */
  brakeArcRadius: number;
  frictionArcRadius: number;
  /** Where the arcs' key sits, under the wheel's name. */
  legendY: number;
  plot: Box;
  wide: boolean;
  height: number;
}

const MARGIN_PX = 12;
/** Below this width the plot goes under the wheel. */
export const WIDE_MIN_PX = 520;
const WIDE_WHEEL_COLUMN = 0.38;
const MAX_RADIUS_WIDE_PX = 70;
const MAX_RADIUS_NARROW_PX = 55;
const COIL_WIDTH = 0.9;
const COIL_HEIGHT = 0.5;
/** Room between coil and wheel for the torque arcs, which start at 12 o'clock. */
const COIL_GAP = 0.34;
const ARC_GAP_PX = 5;
const ARC_SPACING_PX = 6;
/** Under the wheel: its name, then the key to the arcs. */
const WHEEL_LABEL_PX = 20;
const LEGEND_PX = 22;
const PLOT_AXIS_PX = 30;
const PLOT_TITLE_PX = 22;
const PLOT_TIME_PX = 22;
const PLOT_MIN_HEIGHT_PX = 150;

function wheelGroup(cx: number, top: number, radius: number) {
  const coilHeight = radius * COIL_HEIGHT;
  const cy = top + coilHeight + radius * COIL_GAP + radius;
  return {
    group: {
      wheel: { cx, cy, radius },
      coil: { x: cx - (radius * COIL_WIDTH) / 2, y: top, width: radius * COIL_WIDTH, height: coilHeight },
      brakeArcRadius: radius + ARC_GAP_PX,
      frictionArcRadius: radius + ARC_GAP_PX + ARC_SPACING_PX,
      legendY: cy + radius + WHEEL_LABEL_PX + LEGEND_PX / 2,
    },
    bottom: cy + radius + WHEEL_LABEL_PX + LEGEND_PX,
  };
}

export function lenzLayout(cssWidth: number): LenzLayout {
  const width = Math.max(0, cssWidth);
  if (width >= WIDE_MIN_PX) {
    const column = width * WIDE_WHEEL_COLUMN;
    const radius = Math.min(MAX_RADIUS_WIDE_PX, column / 2 - MARGIN_PX - ARC_GAP_PX - ARC_SPACING_PX);
    const { group, bottom } = wheelGroup(column / 2, MARGIN_PX, radius);
    const height = Math.ceil(Math.max(bottom, MARGIN_PX + PLOT_TITLE_PX + PLOT_MIN_HEIGHT_PX) + MARGIN_PX);
    const x = column + PLOT_AXIS_PX;
    const y = MARGIN_PX + PLOT_TITLE_PX;
    return {
      ...group,
      plot: { x, y, width: width - MARGIN_PX - x, height: height - y - PLOT_TIME_PX },
      wide: true,
      height,
    };
  }
  const radius = Math.max(0, Math.min(MAX_RADIUS_NARROW_PX, width / 4 - MARGIN_PX - ARC_GAP_PX - ARC_SPACING_PX));
  const { group, bottom } = wheelGroup(width / 2, MARGIN_PX, radius);
  const y = bottom + MARGIN_PX + PLOT_TITLE_PX;
  return {
    ...group,
    plot: { x: PLOT_AXIS_PX, y, width: Math.max(0, width - MARGIN_PX - PLOT_AXIS_PX), height: PLOT_MIN_HEIGHT_PX },
    wide: false,
    height: Math.ceil(y + PLOT_MIN_HEIGHT_PX + PLOT_TIME_PX),
  };
}

export function heightForWidth(cssWidth: number): number {
  return lenzLayout(cssWidth).height;
}

/** Where a point of a run lands on the plot. Times past the window and speeds off the scale are clamped to its edges. */
export function plotPoint(
  box: Box,
  timeS: number,
  omegaRadS: number,
  windowS: number,
  speedMaxRevS: number,
): { x: number; y: number } {
  const tx = Math.max(0, Math.min(1, timeS / windowS));
  const vy = Math.max(0, Math.min(1, radSToRevS(omegaRadS) / speedMaxRevS));
  return { x: box.x + box.width * tx, y: box.y + box.height * (1 - vy) };
}

/**
 * Where to write the open coil's name: above its curve, half way across the
 * plot. It is the slowest run there is, so nothing is ever drawn above it.
 */
export function openCoilLabelTimeS(windowS: number): number {
  return windowS / 2;
}
