// The mainspring: torque and stored energy as functions of how far the
// barrel is wound. The curve is a table of points joined by straight lines
// (PHYSICS.md, step 2), so stored energy is an exact sum of trapezoids and
// the energy test (test 5) never depends on a numerical integral.

import type { SimParams, TorqueCurve } from './types.ts';
import { TAU } from './units.ts';

/** Barrel angle at full wind, rad. */
export function fullWindAngleRad(params: SimParams): number {
  return params.barrelTurnsFull * TAU;
}

/** How far the barrel is wound, from 0 (let down) to 1 (fully wound). */
export function windFraction(barrelAngleRad: number, params: SimParams): number {
  return Math.min(1, Math.max(0, barrelAngleRad / fullWindAngleRad(params)));
}

/** Barrel torque at a given fraction of full wind, N·m. Zero when let down. */
export function curveTorqueNm(curve: TorqueCurve, fraction: number): number {
  let previous: readonly [number, number] | undefined;
  for (const point of curve) {
    const [x1, t1] = point;
    if (fraction <= x1) {
      if (!previous) return t1;
      const [x0, t0] = previous;
      return t0 + ((t1 - t0) * (fraction - x0)) / (x1 - x0);
    }
    previous = point;
  }
  return previous ? previous[1] : 0;
}

/** Torque the mainspring puts on the barrel, N·m. */
export function mainspringTorqueNm(barrelAngleRad: number, params: SimParams): number {
  return curveTorqueNm(params.mainspringCurve, windFraction(barrelAngleRad, params));
}

/**
 * Energy stored in the mainspring relative to fully let down, J: the area
 * under the torque curve up to this angle, summed exactly segment by segment.
 */
export function mainspringEnergyJ(barrelAngleRad: number, params: SimParams): number {
  const curve = params.mainspringCurve;
  const fraction = windFraction(barrelAngleRad, params);
  let areaNmFraction = 0;
  let previous: readonly [number, number] | undefined;
  for (const point of curve) {
    if (previous) {
      const [x0, t0] = previous;
      if (fraction <= x0) break;
      const xEnd = Math.min(fraction, point[0]);
      areaNmFraction += ((t0 + curveTorqueNm(curve, xEnd)) / 2) * (xEnd - x0);
    }
    previous = point;
  }
  return areaNmFraction * fullWindAngleRad(params);
}

/**
 * Wind the barrel by some angle, rad, as the crown or the automatic rotor
 * would. The bridle slips at full wind, so winding past it does nothing.
 */
export function windBarrel(barrelAngleRad: number, windRad: number, params: SimParams): number {
  return Math.min(fullWindAngleRad(params), Math.max(0, barrelAngleRad + windRad));
}
