// A watch dial's geometry, as pure functions: where the hands point for a
// given time on the hands, and where a point at some angle and radius lands.
// Angle zero points at 12 and angles grow clockwise, as a hand turns. Drawing
// lives in draw.ts; everything here is tested under Node.

import { TAU, wrapAngleRad } from '../../sim/units.ts';

export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
/** A watch dial shows 12 hours a turn. */
export const HOURS_PER_DIAL_TURN = 12;

export interface HandAngles {
  hourRad: number;
  minuteRad: number;
  secondRad: number;
}

/**
 * Where the hands point when they show `shownS` seconds past 12:00. The
 * hands of a Spring Drive move continuously, so there is no rounding here:
 * a ticking hand is a separate function of time (see hero-glide).
 */
export function handAngles(shownS: number): HandAngles {
  const minutes = shownS / SECONDS_PER_MINUTE;
  const hours = minutes / MINUTES_PER_HOUR;
  return {
    hourRad: wrapAngleRad((TAU * hours) / HOURS_PER_DIAL_TURN),
    minuteRad: wrapAngleRad((TAU * minutes) / MINUTES_PER_HOUR),
    secondRad: wrapAngleRad((TAU * shownS) / SECONDS_PER_MINUTE),
  };
}

export interface Point {
  x: number;
  y: number;
}

/** The point at `radius` from (cx, cy) in the direction of a hand at `angleRad`. */
export function polar(cx: number, cy: number, radius: number, angleRad: number): Point {
  return { x: cx + radius * Math.sin(angleRad), y: cy - radius * Math.cos(angleRad) };
}

export interface DialMark {
  angleRad: number;
  /** Every fifth minute mark is an hour mark, drawn longer. */
  major: boolean;
}

/** The 60 minute marks around the chapter ring, starting at 12. */
export const DIAL_MARKS: readonly DialMark[] = Array.from({ length: SECONDS_PER_MINUTE }, (_, i) => ({
  angleRad: (TAU * i) / SECONDS_PER_MINUTE,
  major: i % 5 === 0,
}));
