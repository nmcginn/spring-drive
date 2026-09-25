// Unit conversions shared by the simulation and the widgets that display it.
// These are definitions, not physical parameters, so they live here rather
// than in params.ts and need no PHYSICS.md row.

/** One full turn, in radians. */
export const TAU = 2 * Math.PI;

export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86_400;

/** Rotational speed: revolutions per second to radians per second. */
export function revSToRadS(rev: number): number {
  return rev * TAU;
}

/** Rotational speed: radians per second to revolutions per second. */
export function radSToRevS(omegaRadS: number): number {
  return omegaRadS / TAU;
}

/**
 * Wrap an angle into [0, 2π). Widgets draw angles, and an angle that has
 * accumulated for hours of sim time loses precision in `Math.sin` long before
 * it overflows, so anything drawn is wrapped first.
 */
export function wrapAngleRad(angleRad: number): number {
  const wrapped = angleRad % TAU;
  if (wrapped >= 0) return wrapped;
  // A tiny negative angle plus 2π rounds to exactly 2π, which is outside the
  // half-open range.
  const shifted = wrapped + TAU;
  return shifted < TAU ? shifted : 0;
}
