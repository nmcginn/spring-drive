// Everything the tri-synchro widget decides, other than drawing. The whole
// movement, from full wind to a stop, in averaged mode (decision 23): the
// mainspring drives the glide wheel, the coil charges the capacitor that runs
// the IC, and the IC brakes the wheel to the crystal's reference. The reader
// sets how fast time runs, from a minute to two hours a second, and watches
// the power reserve fall, the brake ease off as the spring weakens, and, at
// the end, regulation fail, the IC brown out, and the wheel stop.
//
// The three are "tri-synchro" because each needs the others: the wheel
// powers the IC through the coil, and the IC holds the wheel through the same
// coil. A panel shows where the power reaching the glide wheel goes: friction,
// the brake, and the electricity that runs the IC (`powerFlows`, PHYSICS.md
// D13).
//
// The physics is `src/sim/averaged.ts`. This module decides when to step it,
// what to record, and how to say it.

import { MAX_FRAME_DT_S } from '../../runtime/scheduler.ts';
import { advanceAveraged, createAveragedState, powerFlows, type PowerFlows } from '../../sim/averaged.ts';
import { fullWindAngleRad } from '../../sim/mainspring.ts';
import { POWER_RESERVE_H, RATED_ACCURACY_S_PER_MONTH } from '../../sim/params.ts';
import type { AveragedState, SimControls, SimParams } from '../../sim/types.ts';
import { SECONDS_PER_DAY, SECONDS_PER_HOUR, radSToRevS } from '../../sim/units.ts';
import type { Role } from '../shared/colours.ts';
import { UNIT_SPACE, formatCount, formatDuration, formatPercent, withUnit } from '../shared/format.ts';
import type { Readout } from '../shared/shell.ts';

const REGULATED: SimControls = { brakeEnabled: true };

/**
 * How fast time runs, in sim seconds per page second: a minute, ten minutes,
 * an hour, and two hours a second. Display rates, not physics. The top one
 * runs the model's whole reserve, 73.8 h to a stop, in 37 s. It costs 120
 * averaged steps a frame at 60 Hz, about 0.4 ms at decision 37's 3 µs a
 * step and 1.2 ms on the slower CI container, inside the 4 ms budget; four
 * hours a second would not be, there.
 */
export const RATES = [60, 600, 3600, 7200] as const;

/** The widget opens at an hour a second: the reserve in about 74 s, and the end in three. */
export const INITIAL_RATE_INDEX = 2;

/**
 * The Skip button jumps this much sim time at once, so a reader under reduced
 * motion can step through the reserve without animation, and any reader can
 * reach its end without waiting. Six hours is 21,600 averaged steps, about
 * 65 ms at 3 µs a step, once per press and never per frame.
 */
export const SKIP_S = 6 * SECONDS_PER_HOUR;

/**
 * The chart's time axis. It runs to the published 72 h reserve and six hours
 * past it, enough for the model's stop at 73.8 h (PHYSICS.md, D7) with room.
 * Nothing is recorded past it.
 */
export const CHART_SPAN_S = 78 * SECONDS_PER_HOUR;

/**
 * A chart point is recorded every this much sim time, and at every event, so
 * the steps at the end are sharp. Five minutes is 936 points across the
 * chart, about three a pixel on a phone.
 */
export const SAMPLE_EVERY_S = 300;

/**
 * The seconds hand is drawn only while it turns at most once a second of
 * page time; faster, it is a blur no frame rate can show (decision 28).
 */
const MAX_SECONDS_HAND_RATE = 60;

export interface ChartPoint {
  timeS: number;
  omegaRadS: number;
  capVoltageV: number;
  /** The duty the coil is actually shorted at: zero while the IC is off. */
  duty: number;
}

/**
 * What the run passes through, in order: regulation ends when the spring can
 * no longer hold 8 rev/s against friction and the charging load, the IC
 * browns out when the slowing wheel can no longer keep the capacitor above
 * 0.6 V, and the wheel stops when the spring cannot beat friction.
 */
export type RunEventKind = 'regulation-ends' | 'ic-off' | 'stops';

export interface RunEvent {
  kind: RunEventKind;
  /** The end of the averaged step it happened in, at most `averagedStepS` after it. */
  timeS: number;
}

export interface TriState {
  sim: AveragedState;
  rateIndex: number;
  /** Chart points, oldest first, from the wind to now or the chart's end. */
  history: readonly ChartPoint[];
  events: readonly RunEvent[];
  /** Sim time of the next regular chart point. */
  nextSampleS: number;
}

/** A chart point for a moment in the run. */
export function chartPoint(s: AveragedState): ChartPoint {
  return {
    timeS: s.timeS,
    omegaRadS: s.rotorOmegaRadS,
    capVoltageV: s.capVoltageV,
    duty: s.icOn ? s.duty : 0,
  };
}

/** The event, if any, that a step from `before` to `after` passed through. Several can fall in one step. */
export function eventsBetween(before: AveragedState, after: AveragedState): RunEventKind[] {
  const out: RunEventKind[] = [];
  if (before.regime === 'regulated' && after.regime !== 'regulated') out.push('regulation-ends');
  if (before.icOn && !after.icOn) out.push('ic-off');
  if (before.regime !== 'stalled' && after.regime === 'stalled') out.push('stops');
  return out;
}

/** The movement just wound fully, at t = 0, already regulated: averaged mode has no lock transient (D7). */
export function initialTriState(params: SimParams, rateIndex = INITIAL_RATE_INDEX): TriState {
  const sim = createAveragedState(params, { windFraction: 1 });
  return { sim, rateIndex, history: [chartPoint(sim)], events: [], nextSampleS: SAMPLE_EVERY_S };
}

/**
 * Run `durationS` of sim time, a step of at most `averagedStepS` at a time,
 * so every event is placed to within a step, recording chart points as it
 * goes. A step's regime and IC state are its end's, so an event is booked at
 * the end of the step it fell in.
 */
function run(state: TriState, durationS: number, params: SimParams): TriState {
  let sim = state.sim;
  let { nextSampleS } = state;
  const added: ChartPoint[] = [];
  const events: RunEvent[] = [];
  let left = Math.max(0, durationS);
  while (left > 0) {
    const dtS = Math.min(params.averagedStepS, left);
    const next = advanceAveraged(sim, params, REGULATED, dtS);
    left -= dtS;
    const kinds = eventsBetween(sim, next);
    const recording = next.timeS <= CHART_SPAN_S;
    if (kinds.length > 0) {
      for (const kind of kinds) events.push({ kind, timeS: next.timeS });
      // Both sides of the step, so a jump at an event is drawn as one.
      if (recording) added.push(chartPoint(sim), chartPoint(next));
    }
    if (next.timeS >= nextSampleS) {
      if (recording && kinds.length === 0) added.push(chartPoint(next));
      nextSampleS = (Math.floor(next.timeS / SAMPLE_EVERY_S) + 1) * SAMPLE_EVERY_S;
    }
    sim = next;
  }
  return {
    ...state,
    sim,
    nextSampleS,
    history: added.length === 0 ? state.history : [...state.history, ...added],
    events: events.length === 0 ? state.events : [...state.events, ...events],
  };
}

/** Sim seconds per page second at the chosen rate. */
export function rate(state: TriState): number {
  return RATES[state.rateIndex] ?? RATES[INITIAL_RATE_INDEX];
}

/**
 * Advance by `dtS` of page time. The scheduler already clamps a frame to
 * `MAX_FRAME_DT_S`; this clamps again, so no caller can ask for days of
 * averaged steps in one frame.
 */
export function advanceTri(state: TriState, dtS: number, params: SimParams): TriState {
  const pageS = Number.isFinite(dtS) ? Math.min(MAX_FRAME_DT_S, Math.max(0, dtS)) : dtS > 0 ? MAX_FRAME_DT_S : 0;
  return run(state, pageS * rate(state), params);
}

/** Jump ahead `SKIP_S` at once, recording as a live run would. */
export function skip(state: TriState, params: SimParams): TriState {
  return run(state, SKIP_S, params);
}

/** Wind fully and start again from t = 0: a new run, with the chart cleared. The rate is kept. */
export function wind(state: TriState, params: SimParams): TriState {
  return initialTriState(params, state.rateIndex);
}

/** Slider position to a rate index, clamped to the stops there are. */
export function setRateIndex(state: TriState, index: number): TriState {
  const i = Math.min(RATES.length - 1, Math.max(0, Math.round(Number.isFinite(index) ? index : INITIAL_RATE_INDEX)));
  return i === state.rateIndex ? state : { ...state, rateIndex: i };
}

// What the reader is told ---------------------------------------------------------

/** A rate as a reader would say it: "1 min/s", "10 min/s", "1 h/s", "2 h/s". */
export function formatRate(simSPerPageS: number): string {
  if (simSPerPageS >= SECONDS_PER_HOUR) return withUnit(simSPerPageS / SECONDS_PER_HOUR, 0, 'h/s');
  return withUnit(simSPerPageS / 60, 0, 'min/s');
}

/** What the slider announces: "1 hour each second". */
export function rateValueText(simSPerPageS: number): string {
  const [n, unit] =
    simSPerPageS >= SECONDS_PER_HOUR ? [simSPerPageS / SECONDS_PER_HOUR, 'hour'] : [simSPerPageS / 60, 'minute'];
  return `${n} ${n === 1 ? unit : `${unit}s`} each second`;
}

/**
 * The power reserve, h, as a gauge geared to the barrel would read it: the
 * turns left in the spring, read at 8 rev/s. Full wind is exactly the
 * published 72 h, because the gear ratio is built on it (PHYSICS.md, D1).
 * It reads the spring, not what the spring can still do, so when regulation
 * ends it still shows 1.35 h (D13).
 */
export function reserveH(state: TriState, params: SimParams): number {
  const barrelTurnsLeft = (state.sim.barrelAngleRad / fullWindAngleRad(params)) * params.barrelTurnsFull;
  return (barrelTurnsLeft * params.gearRatio) / radSToRevS(params.rotorTargetOmegaRadS) / SECONDS_PER_HOUR;
}

/** How far the hands are ahead of true time, s; negative behind. They are geared to the glide wheel, set right at the wind. */
export function handsAheadS(state: TriState, params: SimParams): number {
  return state.sim.rotorAngleRad / params.rotorTargetOmegaRadS - state.sim.timeS;
}

/**
 * The watch's rate right now, s/day: how much a day at this speed would gain
 * or lose. Zero while regulated, because the model's crystal is exact
 * (decision 26); the widget says so beside it.
 */
export function rateSPerDay(state: TriState, params: SimParams): number {
  return (state.sim.rotorOmegaRadS / params.rotorTargetOmegaRadS - 1) * SECONDS_PER_DAY;
}

/** A plus sign on a value that shows as positive. Zero and negatives keep their own sign. */
function signed(text: string, value: number, decimals: number): string {
  return Number(value.toFixed(decimals)) > 0 ? `+${text}` : text;
}

/** A signed offset of the hands: "0.0 s", "−42.5 s", "−2 h 02 min". */
export function formatHandsOffset(seconds: number): string {
  if (Math.abs(seconds) < 60) return signed(withUnit(seconds, 1, 's'), seconds, 1);
  return `${seconds < 0 ? '−' : '+'}${formatDuration(Math.abs(seconds))}`;
}

/** A rate: "0.0 s/day" to a decimal while small, "−40,190 s/day" in whole seconds once it is not. */
export function formatRatePerDay(sPerDay: number): string {
  if (Math.abs(sPerDay) < 1000) return signed(withUnit(sPerDay, 1, 's/day'), sPerDay, 1);
  return `${sPerDay > 0 ? '+' : ''}${formatCount(sPerDay)}${UNIT_SPACE}s/day`;
}

export type TriStatus = 'regulating' | 'catching up' | 'holding back' | 'running, not regulating' | 'off' | 'stopped';

/** What the IC is doing, and whether the wheel turns at all. */
export function status(state: TriState): TriStatus {
  const s = state.sim;
  if (s.regime === 'stalled') return 'stopped';
  if (!s.icOn) return 'off';
  if (s.regime === 'regulated') return 'regulating';
  if (s.regime === 'catching-up') return 'catching up';
  if (s.regime === 'holding-back') return 'holding back';
  return 'running, not regulating';
}

/** The status line under the dial. */
export function statusLine(state: TriState): string {
  const s = status(state);
  if (s === 'stopped') return 'Glide wheel stopped';
  if (s === 'off') return 'IC off: unregulated';
  return `IC: ${s}`;
}

/** Whose colour the status line takes: the part it names. */
export function statusRole(state: TriState): Role {
  return status(state) === 'stopped' ? 'glideWheel' : 'ic';
}

export function flows(state: TriState, params: SimParams): PowerFlows {
  return powerFlows(state.sim, params, REGULATED);
}

export interface PowerShare {
  key: 'friction' | 'brake' | 'charging';
  label: string;
  /** Whose colour the share is drawn in. Friction belongs to no one part (decision 40), so it has none. */
  role: Role | null;
  watts: number;
  /** Share of the power reaching the glide wheel, 0 to 1; zero while nothing reaches it. */
  share: number;
}

/** Where the power reaching the glide wheel goes, as shares of it: friction, the brake, and the electricity. */
export function powerShares(f: PowerFlows): PowerShare[] {
  // Shares of the sum, which is the drive to rounding (tests/sim/power-flows.test.ts),
  // so the three always add up to 100 % as drawn.
  const total = f.frictionW + f.brakeW + f.chargingW;
  const share = (w: number) => (total > 0 ? w / total : 0);
  return [
    { key: 'friction', label: 'Friction', role: null, watts: f.frictionW, share: share(f.frictionW) },
    { key: 'brake', label: 'Brake', role: 'brake', watts: f.brakeW, share: share(f.brakeW) },
    { key: 'charging', label: 'Electricity', role: 'supply', watts: f.chargingW, share: share(f.chargingW) },
  ];
}

/** A small power in the unit that keeps it readable: "1.63 µW", "29.2 nW", "0 W". */
export function formatPower(watts: number): string {
  if (!(watts > 0)) return withUnit(0, 0, 'W');
  if (watts >= 1e-6) return withUnit(watts * 1e6, 2, 'µW');
  return withUnit(watts * 1e9, watts >= 1e-8 ? 1 : 2, 'nW');
}

/** A share as the power panel writes it: "68.8 %", or "0 %" for nothing. */
export function formatShare(share: number): string {
  return share > 0 ? formatPercent(share) : withUnit(0, 0, '%');
}

export function showsSecondsHand(state: TriState): boolean {
  return rate(state) <= MAX_SECONDS_HAND_RATE;
}

/** What an event is called under the chart. */
export function eventLabel(kind: RunEventKind): string {
  switch (kind) {
    case 'regulation-ends':
      return 'Regulation ends';
    case 'ic-off':
      return 'IC browns out';
    case 'stops':
      return 'Glide wheel stops';
  }
}

/** Whose colour an event's line takes: the part it names, or none. */
export function eventRole(kind: RunEventKind): Role | null {
  switch (kind) {
    case 'regulation-ends':
      return null;
    case 'ic-off':
      return 'ic';
    case 'stops':
      return 'glideWheel';
  }
}

export function readouts(state: TriState, params: SimParams): Readout[] {
  return [
    { label: 'Time since wound', value: formatDuration(state.sim.timeS) },
    { label: 'Time runs at', value: formatRate(rate(state)) },
    { label: 'Power reserve', role: 'mainspring', value: withUnit(reserveH(state, params), 1, 'h') },
    { label: 'Glide wheel speed', role: 'speed', value: withUnit(radSToRevS(state.sim.rotorOmegaRadS), 3, 'rev/s') },
    { label: 'Brake duty', role: 'brake', value: formatPercent(state.sim.icOn ? state.sim.duty : 0) },
    { label: 'Supply voltage', role: 'supply', value: withUnit(state.sim.capVoltageV, 3, 'V') },
    { label: 'Hands vs true time', role: 'hands', value: formatHandsOffset(handsAheadS(state, params)) },
    { label: 'Rate', value: formatRatePerDay(rateSPerDay(state, params)) },
  ] as const;
}

/** What the note beside the rate says (decision 26). */
export function rateNote(): string {
  return (
    'Rate: the model’s crystal is exact, so while it regulates it keeps perfect time. ' +
    `A real crystal is not; Seiko rates the 9R65 at ±${RATED_ACCURACY_S_PER_MONTH} s/month, which allows for it.`
  );
}

// The chart --------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a sim time lands across the chart: the wind at the left edge, `CHART_SPAN_S` at the right. */
export function chartX(box: Box, timeS: number): number {
  return box.x + box.width * Math.max(0, Math.min(1, timeS / CHART_SPAN_S));
}

/** Where a value lands in a strip from `min` at the bottom to `max` at the top, clamped to it. */
export function stripY(box: Box, value: number, min: number, max: number): number {
  const f = (value - min) / (max - min);
  const c = Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
  return box.y + box.height * (1 - c);
}

export type Channel = 'speed' | 'supply' | 'duty';

/** A chart point's value on one strip, in the strip's own unit: rev/s, V, or percent. */
export function channelValue(p: ChartPoint, channel: Channel): number {
  if (channel === 'speed') return radSToRevS(p.omegaRadS);
  if (channel === 'supply') return p.capVoltageV;
  return p.duty * 100;
}

export interface ChartChannel {
  channel: Channel;
  title: string;
  min: number;
  max: number;
  grid: readonly number[];
  /** A level worth a dashed line of its own: the target speed, the IC's brownout. Null for duty. */
  mark: number | null;
}

/**
 * The chart's scales. Every value the run passes through fits (PHYSICS.md,
 * D13), with room:
 *
 * - Speed, 0 to 10 rev/s: 8 rev/s while regulated, then down to a stop.
 * - Supply, 0 to 1.5 V: 1.34 V while regulated (the peak less the drop at
 *   8 rev/s is 1.37 V, the most it can reach), 0.6 V at brownout, and
 *   0.891 V after it.
 * - Brake duty, 0 to 15 %: 11.2 % at full wind, down to nothing as
 *   regulation ends.
 */
export const SPEED_SCALE_MAX_REV_S = 10;
export const SUPPLY_SCALE_MAX_V = 1.5;
export const DUTY_SCALE_MAX_PERCENT = 15;

/** The chart's three strips, top to bottom, in their own units. */
export function chartChannels(params: SimParams): readonly ChartChannel[] {
  const targetRevS = radSToRevS(params.rotorTargetOmegaRadS);
  const duty = DUTY_SCALE_MAX_PERCENT;
  return [
    {
      channel: 'speed',
      title: 'Speed, rev/s',
      min: 0,
      max: SPEED_SCALE_MAX_REV_S,
      grid: [0, targetRevS / 2, targetRevS],
      mark: targetRevS,
    },
    {
      channel: 'supply',
      title: 'Supply, V',
      min: 0,
      max: SUPPLY_SCALE_MAX_V,
      grid: [0, SUPPLY_SCALE_MAX_V],
      mark: params.icBrownoutV,
    },
    {
      channel: 'duty',
      title: 'Brake duty, %',
      min: 0,
      max: duty,
      grid: [0, duty / 3, (2 * duty) / 3, duty],
      mark: null,
    },
  ];
}

/** Time labels under the chart, every 24 h: "0 h" … "72 h". The last is the published reserve. */
export function timeLabels(): { timeS: number; text: string }[] {
  const out: { timeS: number; text: string }[] = [];
  for (let h = 0; h * SECONDS_PER_HOUR <= CHART_SPAN_S; h += 24) {
    out.push({ timeS: h * SECONDS_PER_HOUR, text: withUnit(h, 0, 'h') });
  }
  return out;
}

// Layout -------------------------------------------------------------------------------

export interface TriLayout {
  dial: { cx: number; cy: number; radius: number };
  statusY: number;
  /** The power panel beside the dial: a title line, then a bar per share. */
  panel: { x: number; y: number; width: number; bars: Box[] };
  reserve: Box;
  strips: Box[];
  /** Where the event list under the chart starts, one line per event. */
  eventsY: number;
  height: number;
}

const MARGIN_PX = 12;
const MAX_RADIUS_PX = 80;
const STATUS_PX = 24;
const PANEL_TITLE_PX = 40;
/** Each power bar: a label line above it, the bar, and a gap. */
const PANEL_LABEL_PX = 18;
const PANEL_BAR_PX = 8;
const PANEL_GAP_PX = 10;
const RESERVE_TITLE_PX = 22;
const RESERVE_BAR_PX = 10;
const RESERVE_SCALE_PX = 22;
const AXIS_PX = 34;
/** Room over each strip for its title, clear of the axis labels of the strip above and of its own top one. */
const STRIP_TITLE_PX = 30;
const STRIP_HEIGHT_PX = 48;
/** At or above this width the strips are taller, so the chart is not a thin band across a wide page. */
export const WIDE_MIN_PX = 520;
const WIDE_STRIP_HEIGHT_PX = 64;
const STRIP_GAP_PX = 6;
const TIME_AXIS_PX = 22;
export const EVENT_LINE_PX = 18;
/** Speed, supply, and duty. */
const STRIP_COUNT = 3;
/** Regulation ends, brownout, stop. */
const EVENT_LINES = 3;

export function triLayout(cssWidth: number): TriLayout {
  const width = Math.max(0, cssWidth);
  const column = width / 2;
  const radius = Math.max(0, Math.min(MAX_RADIUS_PX, column / 2 - MARGIN_PX));
  const cy = MARGIN_PX + radius;
  const statusY = cy + radius + STATUS_PX / 2 + 4;
  const topBottom = cy + radius + STATUS_PX + 4;

  const panelX = column;
  const panelWidth = Math.max(0, width - MARGIN_PX - panelX);
  const bars: Box[] = [];
  let y = MARGIN_PX + PANEL_TITLE_PX;
  for (let i = 0; i < 3; i++) {
    y += PANEL_LABEL_PX;
    bars.push({ x: panelX, y, width: panelWidth, height: PANEL_BAR_PX });
    y += PANEL_BAR_PX + PANEL_GAP_PX;
  }
  const rowBottom = Math.max(topBottom, y);

  const reserveY = rowBottom + MARGIN_PX + RESERVE_TITLE_PX;
  const reserve = { x: MARGIN_PX, y: reserveY, width: Math.max(0, width - 2 * MARGIN_PX), height: RESERVE_BAR_PX };

  const strips: Box[] = [];
  y = reserveY + RESERVE_BAR_PX + RESERVE_SCALE_PX;
  const stripHeight = width >= WIDE_MIN_PX ? WIDE_STRIP_HEIGHT_PX : STRIP_HEIGHT_PX;
  for (let i = 0; i < STRIP_COUNT; i++) {
    y += STRIP_TITLE_PX;
    strips.push({ x: AXIS_PX, y, width: Math.max(0, width - MARGIN_PX - AXIS_PX), height: stripHeight });
    y += stripHeight + STRIP_GAP_PX;
  }
  const eventsY = y - STRIP_GAP_PX + TIME_AXIS_PX;
  return {
    dial: { cx: column / 2, cy, radius },
    statusY,
    panel: { x: panelX, y: MARGIN_PX, width: panelWidth, bars },
    reserve,
    strips,
    eventsY,
    height: Math.ceil(eventsY + EVENT_LINES * EVENT_LINE_PX + MARGIN_PX),
  };
}

export function heightForWidth(cssWidth: number): number {
  return triLayout(cssWidth).height;
}

/** How much of a bar to fill for `value` on a scale to `max`, from 0 to 1. */
export function barFraction(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** The reserve gauge's fill, 0 to 1, on a scale to the published 72 h. */
export function reserveFraction(state: TriState, params: SimParams): number {
  return barFraction(reserveH(state, params), POWER_RESERVE_H);
}
