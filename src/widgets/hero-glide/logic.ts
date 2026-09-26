// Everything the intro widget decides, other than drawing. Two watches side
// by side: a Spring Drive, whose seconds hand is geared to the simulated
// glide wheel, and an ordinary mechanical watch, whose hand steps once a
// beat. Beneath each dial a loupe follows the tip of its seconds hand,
// because a 0.75° step is under a pixel on a phone-sized dial: magnified,
// the scale glides past one hand and jumps past the other.
//
// The Spring Drive runs in detailed mode, regulated, from a movement already
// settled at full wind (averaged mode's regulated point carried into detailed
// mode), so the reader never sees a lock transient here. The mechanical watch
// is not simulated: a watch with a perfect escapement shows the true time,
// floored to its last beat. Neither watch has a rate error, so the two agree
// but for the steps, which is the point of the comparison.

import { createAveragedState, detailedFromAveraged } from '../../sim/averaged.ts';
import { advanceDetailed } from '../../sim/detailed.ts';
import { MECHANICAL_BEAT_HZ } from '../../sim/params.ts';
import type { SimParams, SimState } from '../../sim/types.ts';
import { TAU, radSToRevS } from '../../sim/units.ts';
import { SECONDS_PER_MINUTE, type Point } from '../shared/dial.ts';
import { formatRatio, withUnit } from '../shared/format.ts';

const REGULATED = { brakeEnabled: true } as const;

/**
 * Slow motion runs the page's clock at an eighth of real time, so the
 * mechanical hand steps once a second and each step can be followed by eye.
 * A display rate, not physics.
 */
export const SLOW_MOTION_RATE = 1 / 8;

/**
 * How much the loupes magnify. On a phone the dial radius is 77 px, so the hand
 * tip is at 72 px, where a 0.75° step is 0.94 px: 11 px in the loupe.
 */
export const LOUPE_MAGNIFICATION = 12;

/**
 * The time both dials show at mount: 10:08:00, so the hour and minute hands
 * frame the dial rather than hiding under the seconds hand at 12.
 */
export const DIAL_START_S = 10 * 3600 + 8 * 60;

export interface HeroState {
  sim: SimState;
  /** Sim time too short for another detailed step, carried to the next frame. */
  carryS: number;
  /** Glide wheel angle and sim time when the dials read DIAL_START_S. */
  originAngleRad: number;
  originTimeS: number;
  slowMotion: boolean;
}

export function initialHeroState(params: SimParams): HeroState {
  const sim = detailedFromAveraged(createAveragedState(params, { windFraction: 1 }), params);
  return { sim, carryS: 0, originAngleRad: sim.rotorAngleRad, originTimeS: sim.timeS, slowMotion: false };
}

export function playbackRate(state: HeroState): number {
  return state.slowMotion ? SLOW_MOTION_RATE : 1;
}

/** Advance by `dtS` of page time, which is sim time scaled by the playback rate. */
export function advanceHero(state: HeroState, dtS: number, params: SimParams): HeroState {
  const out = advanceDetailed(state.sim, params, REGULATED, dtS * playbackRate(state), state.carryS);
  return { ...state, sim: out.state, carryS: out.carryS };
}

export function setSlowMotion(state: HeroState, slowMotion: boolean): HeroState {
  return { ...state, slowMotion };
}

/** True time since mount, s. */
export function elapsedS(state: HeroState): number {
  return state.sim.timeS - state.originTimeS;
}

/**
 * What the Spring Drive's hands show, s past 12:00. They are geared to the
 * glide wheel, one minute of hand travel per 480 turns: the angle the wheel
 * has turned, read at the 8 rev/s it is regulated to.
 */
export function springDriveShownS(state: HeroState, params: SimParams): number {
  return DIAL_START_S + (state.sim.rotorAngleRad - state.originAngleRad) / params.rotorTargetOmegaRadS;
}

/** What the mechanical watch's hands show, s past 12:00: true time, floored to the last beat. */
export function mechanicalShownS(elapsed: number, beatHz: number = MECHANICAL_BEAT_HZ): number {
  return DIAL_START_S + Math.floor(elapsed * beatHz) / beatHz;
}

/** How far the mechanical seconds hand jumps each beat, rad: 6° a second, split into beats. */
export function beatStepRad(beatHz: number = MECHANICAL_BEAT_HZ): number {
  return TAU / SECONDS_PER_MINUTE / beatHz;
}

// Readouts ---------------------------------------------------------------------

export function formatPlayback(rate: number): string {
  // A rate below 1 reads as a fraction, "1/8×", which is how people say it.
  return rate >= 1 ? formatRatio(rate, 0) : `1/${Math.round(1 / rate)}×`;
}

export function readouts(state: HeroState) {
  const degreesPerBeat = (beatStepRad() * 360) / TAU;
  return [
    { label: 'Glide wheel speed', value: withUnit(radSToRevS(state.sim.rotorOmegaRadS), 3, 'rev/s') },
    { label: 'Mechanical watch', value: withUnit(MECHANICAL_BEAT_HZ, 0, 'beats/s') },
    // The degree sign takes no space before it.
    { label: 'Mechanical hand steps', value: `${degreesPerBeat.toFixed(2)}° a beat` },
    { label: 'Playback', value: `${formatPlayback(playbackRate(state))} real time` },
  ] as const;
}

// Layout -------------------------------------------------------------------------

export interface DialLayout {
  cx: number;
  cy: number;
  radius: number;
  /** Where the caption under the dial sits. */
  labelY: number;
  loupe: { cx: number; cy: number; radius: number };
}

export interface HeroLayout {
  springDrive: DialLayout;
  mechanical: DialLayout;
  height: number;
}

const MARGIN_PX = 8;
const MAX_DIAL_RADIUS_PX = 110;
const MIN_LOUPE_RADIUS_PX = 28;
const MAX_LOUPE_RADIUS_PX = 56;
const LABEL_GAP_PX = 18;
const LOUPE_GAP_PX = 14;
/** Room under each loupe for its "×12" caption. */
const LOUPE_CAPTION_PX = 22;

/** Two dials side by side, each with its loupe beneath. */
export function heroLayout(cssWidth: number): HeroLayout {
  const column = Math.max(0, cssWidth) / 2;
  const radius = Math.max(0, Math.min(column / 2 - 12, MAX_DIAL_RADIUS_PX));
  const cy = MARGIN_PX + radius;
  const labelY = cy + radius + LABEL_GAP_PX;
  const loupeRadius = Math.min(MAX_LOUPE_RADIUS_PX, Math.max(MIN_LOUPE_RADIUS_PX, radius * 0.55));
  const loupeCy = labelY + LOUPE_GAP_PX + loupeRadius;
  const dial = (cx: number): DialLayout => ({
    cx,
    cy,
    radius,
    labelY,
    loupe: { cx, cy: loupeCy, radius: loupeRadius },
  });
  return {
    springDrive: dial(column / 2),
    mechanical: dial(column * 1.5),
    height: Math.ceil(loupeCy + loupeRadius + LOUPE_CAPTION_PX),
  };
}

export function heightForWidth(cssWidth: number): number {
  return heroLayout(cssWidth).height;
}

// The loupe ------------------------------------------------------------------------

/** Where a hand's tip sits, and the loupe centres on, as a fraction of the dial radius. */
export const TIP_RADIUS = 0.93;

/**
 * Where a point of the dial, at radius `rhoPx` and angle `angleRad`, appears
 * in a loupe centred on the dial's radius `tipPx` at angle `centreRad`,
 * magnified `k` times. The loupe is turned so that the direction of
 * `centreRad` points up: marks for later seconds appear to its right, and
 * move left as the hand it follows advances.
 */
export function loupePoint(
  rhoPx: number,
  angleRad: number,
  centreRad: number,
  tipPx: number,
  k: number,
  loupe: Point,
): Point {
  const phi = angleRad - centreRad;
  return { x: loupe.x + k * rhoPx * Math.sin(phi), y: loupe.y + k * (tipPx - rhoPx * Math.cos(phi)) };
}

export interface LoupeMark {
  angleRad: number;
  /** A whole second, drawn long; otherwise an eighth of a second, one beat. */
  second: boolean;
}

/**
 * The seconds and beat marks within `halfWindowRad` of `centreRad`: the scale
 * the loupe shows, so a reader can count the mechanical hand's steps against
 * it. Marks are generated by index, so none is lost or doubled to rounding.
 */
export function loupeMarks(centreRad: number, halfWindowRad: number, beatHz: number = MECHANICAL_BEAT_HZ): LoupeMark[] {
  const step = beatStepRad(beatHz);
  const first = Math.ceil((centreRad - halfWindowRad) / step);
  const last = Math.floor((centreRad + halfWindowRad) / step);
  const marks: LoupeMark[] = [];
  for (let i = first; i <= last; i++) {
    marks.push({ angleRad: i * step, second: ((i % beatHz) + beatHz) % beatHz === 0 });
  }
  return marks;
}

/** The dial angle a loupe of `radiusPx` spans either side of its centre, with a little spare so marks enter smoothly. */
export function loupeHalfWindowRad(radiusPx: number, tipPx: number, k: number): number {
  if (tipPx <= 0 || k <= 0) return 0;
  return (1.2 * radiusPx) / (k * tipPx);
}
