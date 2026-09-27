// Everything the generator widget decides, other than drawing. The reader
// sets the glide wheel's speed with a slider; the wheel's magnet turns past
// the coil at that speed, and a scope traces the EMF it induces over the
// last half second. Faster turning makes the trace both taller and more
// tightly packed, which is the section's point: EMF grows with speed.
//
// The wheel is turned at whatever speed the reader sets, as a hand on a
// crank would. Nothing here is dynamics, so this widget needs neither
// detailed nor averaged mode: the wheel's angle is its speed integrated over
// time, and the EMF at each moment comes from `instantaneousEmfV` in
// src/sim/generator.ts (PHYSICS.md, D9). No current flows, so nothing brakes
// the wheel; the brake is the next section's.

import { emfFrequencyHz, emfV, instantaneousEmfV, peakEmfV } from '../../sim/generator.ts';
import type { SimParams } from '../../sim/types.ts';
import { radSToRevS, revSToRadS } from '../../sim/units.ts';
import { formatPlayback, withUnit } from '../shared/format.ts';

/**
 * Slow motion runs the page's clock at an eighth of real time, as in the
 * intro, so 8 rev/s turns once a second and the trace can be matched to the
 * magnet by eye. A display rate, not physics.
 */
export const SLOW_MOTION_RATE = 1 / 8;

/**
 * The slider runs from rest to twice the regulated speed, so 8 rev/s sits
 * in its middle. A display range: the unbraked wheel's 30.6 rev/s (the
 * previous section) would squeeze 8 rev/s into a quarter of the slider.
 */
export const SPEED_MAX_FACTOR = 2;
export const SPEED_STEP_REV_S = 0.1;

/**
 * The scope shows the last half second of sim time: four cycles at 8 rev/s
 * with one pole pair, eight at the top of the slider, which a 356 px phone
 * column still draws at 20 px a cycle.
 */
export const SCOPE_WINDOW_S = 0.5;
/** The scope's voltage scale is the peak EMF at the top speed, rounded up to this. */
export const SCOPE_SCALE_STEP_V = 0.5;

export function speedMaxRevS(params: SimParams): number {
  return SPEED_MAX_FACTOR * radSToRevS(params.rotorTargetOmegaRadS);
}

/**
 * From `startS` on, the wheel turns at `omegaRadS`, from `startAngleRad`.
 * A change of speed starts a new segment, so the scope can show the trace
 * before and after it: the wheel is driven, and changes speed at once.
 */
export interface Segment {
  startS: number;
  startAngleRad: number;
  omegaRadS: number;
}

export interface GeneratorState {
  timeS: number;
  /** In time order. The first starts at or before `timeS − SCOPE_WINDOW_S`, so the scope is always full. */
  segments: readonly Segment[];
  slowMotion: boolean;
  /**
   * The angle the wheel turned through over the last frame, rad, for the
   * motion blur. Zero until the first frame, so a static frame is sharp.
   */
  sweepRad: number;
}

/**
 * The wheel at the regulated 8 rev/s, as it will run in the watch, with the
 * scope already full: it has been turning for a whole window, and a north
 * pole faces the coil now.
 */
export function initialGeneratorState(params: SimParams): GeneratorState {
  const omegaRadS = params.rotorTargetOmegaRadS;
  return {
    timeS: 0,
    segments: [{ startS: -SCOPE_WINDOW_S, startAngleRad: -omegaRadS * SCOPE_WINDOW_S, omegaRadS }],
    slowMotion: false,
    sweepRad: 0,
  };
}

function segmentAt(segments: readonly Segment[], tS: number): Segment {
  let found: Segment | undefined;
  for (const s of segments) {
    // The first segment answers for any earlier time: the wheel was already turning.
    if (found && s.startS > tS) break;
    found = s;
  }
  if (!found) throw new Error('a generator state always has at least one segment');
  return found;
}

function startOf(segments: readonly Segment[], i: number): number {
  return segments[i]?.startS ?? Number.POSITIVE_INFINITY;
}

export function angleAtRad(state: GeneratorState, tS: number): number {
  const s = segmentAt(state.segments, tS);
  return s.startAngleRad + s.omegaRadS * (tS - s.startS);
}

export function omegaAtRadS(state: GeneratorState, tS: number): number {
  return segmentAt(state.segments, tS).omegaRadS;
}

export function rotorAngleRad(state: GeneratorState): number {
  return angleAtRad(state, state.timeS);
}

export function rotorOmegaRadS(state: GeneratorState): number {
  return omegaAtRadS(state, state.timeS);
}

/**
 * Set the wheel's speed. While the widget is animating (`live`), the change
 * happens now, and the scope shows the trace change as it scrolls. While it
 * is still (paused, offscreen, or a reduced-motion static frame), sim time
 * does not move, so a change made now would never be seen: instead the
 * whole window is redrawn as if the wheel had always turned at the new
 * speed, with the magnet where it is.
 */
export function setSpeed(state: GeneratorState, revS: number, live: boolean): GeneratorState {
  const omegaRadS = revSToRadS(Math.max(0, revS));
  const angle = rotorAngleRad(state);
  if (!live) {
    const startS = state.timeS - SCOPE_WINDOW_S;
    return { ...state, segments: [{ startS, startAngleRad: angle - omegaRadS * SCOPE_WINDOW_S, omegaRadS }] };
  }
  if (omegaRadS === rotorOmegaRadS(state)) return state;
  // Several slider events in one frame replace each other rather than piling up.
  const kept = state.segments.filter((s) => s.startS < state.timeS);
  return { ...state, segments: [...kept, { startS: state.timeS, startAngleRad: angle, omegaRadS }] };
}

export function playbackRate(state: GeneratorState): number {
  return state.slowMotion ? SLOW_MOTION_RATE : 1;
}

export function setSlowMotion(state: GeneratorState, slowMotion: boolean): GeneratorState {
  return { ...state, slowMotion };
}

/** Advance by `dtS` of page time, which is sim time scaled by the playback rate. */
export function advanceGenerator(state: GeneratorState, dtS: number): GeneratorState {
  const stepS = Number.isFinite(dtS) ? Math.max(0, dtS) : 0;
  const timeS = state.timeS + stepS * playbackRate(state);
  // Drop segments that ended before the window opens; keep the one in force
  // at its left edge.
  const windowStartS = timeS - SCOPE_WINDOW_S;
  let first = 0;
  while (startOf(state.segments, first + 1) <= windowStartS) first += 1;
  const next = { ...state, timeS, segments: state.segments.slice(first) };
  return { ...next, sweepRad: rotorAngleRad(next) - rotorAngleRad(state) };
}

/**
 * The EMF across the coil at `count` evenly spaced moments over the scope's
 * window, oldest first, V. The last is now.
 */
export function emfTrace(state: GeneratorState, params: SimParams, count: number): number[] {
  const n = Math.max(2, Math.floor(count));
  const startS = state.timeS - SCOPE_WINDOW_S;
  const out: number[] = new Array<number>(n);
  let k = 0;
  const segs = state.segments;
  for (let i = 0; i < n; i++) {
    const tS = startS + (SCOPE_WINDOW_S * i) / (n - 1);
    // Samples are in time order, so the segment index only moves forward.
    while (startOf(segs, k + 1) <= tS) k += 1;
    const s = segs[k] ?? segmentAt(segs, tS);
    out[i] = instantaneousEmfV(s.startAngleRad + s.omegaRadS * (tS - s.startS), s.omegaRadS, params);
  }
  return out;
}

/** The scope's half-height in volts: the peak EMF at the top speed, rounded up to a step. */
export function scopeScaleV(params: SimParams): number {
  const top = peakEmfV(revSToRadS(speedMaxRevS(params)), params);
  return Math.ceil(top / SCOPE_SCALE_STEP_V) * SCOPE_SCALE_STEP_V;
}

/** Whole volts inside the scale, for grid lines, from the bottom up. */
export function scopeGridV(scaleV: number): number[] {
  const top = Math.floor(scaleV);
  const out: number[] = [];
  for (let v = -top; v <= top; v++) out.push(v);
  return out;
}

// Readouts ---------------------------------------------------------------------

export function readouts(state: GeneratorState, params: SimParams) {
  const omega = rotorOmegaRadS(state);
  return [
    { label: 'Glide wheel speed', value: withUnit(radSToRevS(omega), 1, 'rev/s') },
    { label: 'EMF frequency', value: withUnit(emfFrequencyHz(omega, params), 1, 'Hz') },
    { label: 'Peak EMF', value: withUnit(peakEmfV(omega, params), 2, 'V') },
    { label: 'Rectified mean EMF', value: withUnit(emfV(omega, params), 2, 'V') },
    { label: 'Playback', value: `${formatPlayback(playbackRate(state))} real time` },
  ] as const;
}

/** What the slider announces: the speed with its unit. */
export function speedValueText(revS: number): string {
  return withUnit(revS, 1, 'rev/s');
}

// Layout -------------------------------------------------------------------------

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeneratorLayout {
  wheel: { cx: number; cy: number; radius: number };
  /** The coil's core, above the wheel, where the magnet's flux passes through it. */
  coil: Box;
  /** The scope's plot area, inside its axis labels. */
  scope: Box;
  /** Whether the scope sits beside the wheel (wide) or under it (narrow). */
  wide: boolean;
  height: number;
}

const MARGIN_PX = 12;
/** Below this width the scope goes under the wheel, so neither is cramped. */
export const WIDE_MIN_PX = 520;
const WIDE_WHEEL_COLUMN = 0.36;
const MAX_RADIUS_WIDE_PX = 80;
const MAX_RADIUS_NARROW_PX = 60;
/** The coil's core, as fractions of the wheel radius. */
const COIL_WIDTH = 0.9;
const COIL_HEIGHT = 0.5;
const COIL_GAP = 0.14;
/** Room under the wheel for its name. */
const WHEEL_LABEL_PX = 20;
/** Room left of the plot for the volt labels, above it for its title, below it for the time labels. */
const SCOPE_AXIS_PX = 34;
const SCOPE_TITLE_PX = 22;
const SCOPE_TIME_PX = 22;
const SCOPE_MIN_HEIGHT_PX = 140;

function wheelGroup(cx: number, top: number, radius: number) {
  const coilHeight = radius * COIL_HEIGHT;
  const cy = top + coilHeight + radius * COIL_GAP + radius;
  return {
    wheel: { cx, cy, radius },
    coil: { x: cx - (radius * COIL_WIDTH) / 2, y: top, width: radius * COIL_WIDTH, height: coilHeight },
    bottom: cy + radius + WHEEL_LABEL_PX,
  };
}

export function generatorLayout(cssWidth: number): GeneratorLayout {
  const width = Math.max(0, cssWidth);
  if (width >= WIDE_MIN_PX) {
    const column = width * WIDE_WHEEL_COLUMN;
    const radius = Math.min(MAX_RADIUS_WIDE_PX, column / 2 - MARGIN_PX);
    const g = wheelGroup(column / 2, MARGIN_PX, radius);
    const height = Math.ceil(Math.max(g.bottom, MARGIN_PX + SCOPE_TITLE_PX + SCOPE_MIN_HEIGHT_PX) + MARGIN_PX);
    const x = column + SCOPE_AXIS_PX;
    const y = MARGIN_PX + SCOPE_TITLE_PX;
    return {
      wheel: g.wheel,
      coil: g.coil,
      scope: { x, y, width: width - MARGIN_PX - x, height: height - y - SCOPE_TIME_PX },
      wide: true,
      height,
    };
  }
  const radius = Math.max(0, Math.min(MAX_RADIUS_NARROW_PX, width / 4 - MARGIN_PX));
  const g = wheelGroup(width / 2, MARGIN_PX, radius);
  const y = g.bottom + MARGIN_PX + SCOPE_TITLE_PX;
  return {
    wheel: g.wheel,
    coil: g.coil,
    scope: { x: SCOPE_AXIS_PX, y, width: Math.max(0, width - MARGIN_PX - SCOPE_AXIS_PX), height: SCOPE_MIN_HEIGHT_PX },
    wide: false,
    height: Math.ceil(y + SCOPE_MIN_HEIGHT_PX + SCOPE_TIME_PX),
  };
}

export function heightForWidth(cssWidth: number): number {
  return generatorLayout(cssWidth).height;
}

/** Where a sample lands on the scope: the i-th of n across it, at `emfV` on a ± `scaleV` scale. */
export function scopePoint(box: Box, i: number, n: number, emfV: number, scaleV: number): { x: number; y: number } {
  const clamped = Math.max(-scaleV, Math.min(scaleV, emfV));
  return {
    x: box.x + (box.width * i) / Math.max(1, n - 1),
    y: box.y + (box.height / 2) * (1 - clamped / scaleV),
  };
}
