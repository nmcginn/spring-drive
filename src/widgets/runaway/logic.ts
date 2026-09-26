// Everything the runaway widget decides, other than drawing. A mainspring
// drives the glide wheel with nothing to hold it back: the brake is disabled,
// exactly as in physics test 1 and the CLI's `runaway` scenario. The reader
// winds the spring, watches the wheel spin up past the 8 rev/s that would keep
// time, and can fast-forward to watch the spring run down in about 29 hours
// instead of 72.
//
// In real time the movement runs in detailed mode, so the spin-up is the real
// transient. Fast-forward runs averaged mode, an hour of sim time per second
// of page time; switching hands the state from one mode to the other
// (`averagedFromDetailed`, `detailedFromAveraged`).
//
// The dial's hands are geared to the glide wheel, so they show the time the
// wheel has turned through at 8 rev/s. Faint hands beside them show true
// time. Winding sets both to 12:00, so their difference is what this run has
// gained.

import {
  advanceAveraged,
  averagedFromDetailed,
  createAveragedState,
  detailedFromAveraged,
  settle,
  windAveraged,
} from '../../sim/averaged.ts';
import { advanceDetailed, createState, windDetailed } from '../../sim/detailed.ts';
import { fullWindAngleRad, windFraction } from '../../sim/mainspring.ts';
import type { AveragedState, SimParams, SimState } from '../../sim/types.ts';
import { TAU, radSToRevS } from '../../sim/units.ts';
import { formatDuration, formatPercent, formatRatio, withUnit } from '../shared/format.ts';

const UNBRAKED = { brakeEnabled: false } as const;

/**
 * Fast-forward runs an hour of sim time each second, so the whole unbraked
 * run-down from full wind (about 29 h) takes half a minute to watch. A
 * display rate, not physics. Averaged mode costs about 9 µs a step, so this
 * is about 0.5 ms a frame at 60 Hz, well inside the 4 ms budget (decision 23).
 */
export const FAST_FORWARD_RATE = 3600;

/** The speed scale runs to the unbraked full-wind speed, rounded up to this. */
export const SPEED_SCALE_STEP_REV_S = 5;

export type RunawaySim =
  { mode: 'real-time'; state: SimState; carryS: number } | { mode: 'fast-forward'; state: AveragedState };

export interface RunawayState {
  sim: RunawaySim;
  /** Glide wheel angle and sim time at the last wind, when both sets of hands read 12:00. */
  originAngleRad: number;
  originTimeS: number;
  /**
   * The angle the glide wheel turned through over the last frame, rad. The
   * wheel is drawn smeared over it, as the eye or a camera sees a fast wheel.
   * Zero until the first frame, so a static frame is sharp.
   */
  sweepRad: number;
}

/** The spring let down and the wheel at rest: nothing happens until the reader winds it. */
export function initialRunawayState(params: SimParams): RunawayState {
  const state = createState(params, { windFraction: 0 });
  return {
    sim: { mode: 'real-time', state, carryS: 0 },
    originAngleRad: state.rotorAngleRad,
    originTimeS: state.timeS,
    sweepRad: 0,
  };
}

export function rotorAngleRad(state: RunawayState): number {
  return state.sim.state.rotorAngleRad;
}

export function rotorOmegaRadS(state: RunawayState): number {
  return state.sim.state.rotorOmegaRadS;
}

function simTimeS(state: RunawayState): number {
  return state.sim.state.timeS;
}

/** Wind the spring fully, and set both sets of hands to 12:00. */
export function wind(state: RunawayState, params: SimParams): RunawayState {
  const full = fullWindAngleRad(params);
  const sim: RunawaySim =
    state.sim.mode === 'real-time'
      ? { ...state.sim, state: windDetailed(state.sim.state, full, params) }
      : { mode: 'fast-forward', state: windAveraged(state.sim.state, full, params, UNBRAKED) };
  return { ...state, sim, originAngleRad: sim.state.rotorAngleRad, originTimeS: sim.state.timeS };
}

export function isFastForward(state: RunawayState): boolean {
  return state.sim.mode === 'fast-forward';
}

/** Switch between real time (detailed mode) and fast-forward (averaged mode). */
export function setFastForward(state: RunawayState, on: boolean, params: SimParams): RunawayState {
  if (on === isFastForward(state)) return state;
  const sim: RunawaySim =
    state.sim.mode === 'real-time'
      ? { mode: 'fast-forward', state: settle(averagedFromDetailed(state.sim.state, params), params, UNBRAKED) }
      : { mode: 'real-time', state: detailedFromAveraged(state.sim.state, params), carryS: 0 };
  return { ...state, sim };
}

/** Advance by `dtS` of page time. */
export function advanceRunaway(state: RunawayState, dtS: number, params: SimParams): RunawayState {
  const before = rotorAngleRad(state);
  let sim: RunawaySim;
  if (state.sim.mode === 'real-time') {
    const out = advanceDetailed(state.sim.state, params, UNBRAKED, dtS, state.sim.carryS);
    sim = { mode: 'real-time', state: out.state, carryS: out.carryS };
  } else {
    sim = { mode: 'fast-forward', state: advanceAveraged(state.sim.state, params, UNBRAKED, dtS * FAST_FORWARD_RATE) };
  }
  return { ...state, sim, sweepRad: sim.state.rotorAngleRad - before };
}

/** What the hands show, s past 12:00: the wheel's turns since winding, read at 8 rev/s. */
export function shownS(state: RunawayState, params: SimParams): number {
  return (rotorAngleRad(state) - state.originAngleRad) / params.rotorTargetOmegaRadS;
}

/** True time since winding, s. */
export function trueS(state: RunawayState): number {
  return simTimeS(state) - state.originTimeS;
}

/** How fast the hands move against how fast they should: 1 keeps time. */
export function speedRatio(state: RunawayState, params: SimParams): number {
  return rotorOmegaRadS(state) / params.rotorTargetOmegaRadS;
}

export function woundFraction(state: RunawayState, params: SimParams): number {
  return windFraction(state.sim.state.barrelAngleRad, params);
}

/**
 * The top of the speed scale: the unbraked wheel's speed at full wind (30.61
 * rev/s, PHYSICS.md), rounded up to a whole step, so the fastest the wheel
 * ever runs fits with a little room.
 */
export function speedScaleMaxRevS(params: SimParams): number {
  const top = settle(createAveragedState(params, { windFraction: 1 }), params, UNBRAKED).rotorOmegaRadS;
  return Math.ceil(radSToRevS(top) / SPEED_SCALE_STEP_REV_S) * SPEED_SCALE_STEP_REV_S;
}

// Readouts ---------------------------------------------------------------------

export function readouts(state: RunawayState, params: SimParams) {
  return [
    { label: 'Glide wheel speed', value: withUnit(radSToRevS(rotorOmegaRadS(state)), 1, 'rev/s') },
    { label: 'Hands run at', value: `${formatRatio(speedRatio(state, params))} real time` },
    { label: 'Hands show', value: formatDuration(shownS(state, params)) },
    { label: 'True time', value: formatDuration(trueS(state)) },
    { label: 'Mainspring wound', value: formatPercent(woundFraction(state, params)) },
  ] as const;
}

// Drawing geometry ---------------------------------------------------------------

/** The glide wheel is drawn with this many spokes, so its turning is visible. */
export const SPOKE_COUNT = 4;

/** Below this sweep a frame is drawn sharp. About 3°, a pixel at the rim of a 20 px wheel. */
const SHARP_SWEEP_RAD = 0.05;
const MAX_BLUR_COPIES = 12;

export interface Blur {
  /** How many copies of the spokes to draw, trailing back from the current angle. */
  copies: number;
  /** Angle between copies, rad. */
  stepRad: number;
  /** Opacity of each copy. */
  alpha: number;
}

/**
 * Motion blur for a wheel that turned `sweepRad` in a frame. The spokes are
 * drawn at several angles across the sweep, each faint, as a camera's
 * exposure would record them. Past one spoke spacing the pattern repeats, so
 * the smear never needs to span more than that: a wheel at 30 rev/s is a
 * uniform blur, which is what it looks like, rather than the backwards-turning
 * wagon wheel that a sharp drawing at 60 frames a second would show.
 */
export function blur(sweepRad: number, spokeCount: number = SPOKE_COUNT): Blur {
  const spanRad = Math.min(Math.abs(sweepRad), TAU / spokeCount);
  if (!(spanRad >= SHARP_SWEEP_RAD)) return { copies: 1, stepRad: 0, alpha: 1 };
  const copies = Math.min(MAX_BLUR_COPIES, Math.ceil(spanRad / SHARP_SWEEP_RAD) + 1);
  // Overlapping copies add up, so each is fainter the more there are, but
  // never so faint that the smear disappears against the surface.
  return { copies, stepRad: spanRad / (copies - 1), alpha: Math.max(0.2, 1.5 / copies) };
}

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RunawayLayout {
  rotor: { cx: number; cy: number; radius: number };
  dial: { cx: number; cy: number; radius: number };
  speedBar: Bar;
  springBar: Bar;
  height: number;
}

const MARGIN_PX = 12;
const MAX_RADIUS_PX = 100;
const BAR_HEIGHT_PX = 10;
/** Room above a bar for its label, and below it for its scale. */
const BAR_LABEL_PX = 20;
const BAR_SCALE_PX = 24;

/** The wheel and the dial side by side, and the speed and spring bars under them. */
export function runawayLayout(cssWidth: number): RunawayLayout {
  const width = Math.max(0, cssWidth);
  const column = width / 2;
  const radius = Math.max(0, Math.min(column / 2 - MARGIN_PX, MAX_RADIUS_PX));
  const cy = MARGIN_PX + radius;
  const barWidth = Math.max(0, width - 2 * MARGIN_PX);
  const speedY = cy + radius + MARGIN_PX + BAR_LABEL_PX;
  const springY = speedY + BAR_HEIGHT_PX + BAR_SCALE_PX + BAR_LABEL_PX;
  return {
    rotor: { cx: column / 2, cy, radius },
    dial: { cx: column * 1.5, cy, radius },
    speedBar: { x: MARGIN_PX, y: speedY, width: barWidth, height: BAR_HEIGHT_PX },
    springBar: { x: MARGIN_PX, y: springY, width: barWidth, height: BAR_HEIGHT_PX },
    height: Math.ceil(springY + BAR_HEIGHT_PX + BAR_SCALE_PX),
  };
}

export function heightForWidth(cssWidth: number): number {
  return runawayLayout(cssWidth).height;
}

/** How much of a bar to fill for `value` on a scale to `max`, from 0 to 1. */
export function barFraction(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(1, Math.max(0, value / max));
}
