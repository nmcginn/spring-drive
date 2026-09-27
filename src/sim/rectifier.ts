// The charging path: the coil's sine EMF through a rectifier and the coil's
// own resistance into the capacitor (PHYSICS.md, D5, and M7b).
//
// The rectifier is full-wave with a fixed drop. It conducts only while the
// EMF's magnitude exceeds the capacitor voltage plus that drop, the
// threshold u, and then passes (|e| − u)/R. For e = E·sin θ that is a window
// either side of each peak, from α to π − α with sin α = u/E, so the
// capacitor charges toward the peak less the drop, not the mean less the
// drop. Over a cycle the current's mean, its mean square, and the power the
// EMF delivers all have closed forms in E, u, and α, below.
//
// The capacitor voltage is held fixed over the cycle. Its ripple at 8 rev/s
// is about 10 mV peak to peak, and moves the mean by under 1 mV (PHYSICS.md,
// D5, and the test that integrates the circuit instantaneously).

import { solveDecreasing } from './solve.ts';

/** Where the rectifier starts conducting in each half cycle, rad: sin α = u/E. π/2 when it never does. */
export function conductionAngleRad(peakV: number, thresholdV: number): number {
  if (peakV <= thresholdV) return Math.PI / 2;
  return Math.asin(Math.max(0, thresholdV) / peakV);
}

export interface RectifierCycle {
  /** Mean current into the capacitor over a cycle, A. */
  meanA: number;
  /** Mean of the current squared over a cycle, A²: R times this is the coil's heat. */
  meanSquareA2: number;
  /** Mean power the EMF delivers into the path, |e|·i over a cycle, W: coil heat, rectifier heat, and charge. */
  meanPowerW: number;
}

const NO_CURRENT: RectifierCycle = Object.freeze({ meanA: 0, meanSquareA2: 0, meanPowerW: 0 });

/**
 * One cycle of the sine `peakV`·sin θ charging through a resistance
 * `resistanceOhm` against a threshold `thresholdV` (capacitor plus drop).
 * With a = α and window w = π − 2α, over a half cycle of length π:
 * - mean i  = (2E·cos a − u·w) / (πR)
 * - mean i² = (E²·(w/2 + sin a·cos a) − 4uE·cos a + u²·w) / (πR²)
 * - mean |e|·i = (E²·(w/2 + sin a·cos a) − 2uE·cos a) / (πR)
 * and the last is u·(mean i) + R·(mean i²), which is where the power goes.
 */
export function rectifierCycle(peakV: number, thresholdV: number, resistanceOhm: number): RectifierCycle {
  const E = Math.abs(peakV);
  if (E <= Math.max(0, thresholdV)) return NO_CURRENT;
  return rectifierCycleAtAngle(E, conductionAngleRad(E, thresholdV), resistanceOhm);
}

/**
 * `rectifierCycle` given the conduction angle α instead of the threshold,
 * which is then E·sin α. Averaged mode searches over α, and this saves it
 * the arcsine.
 */
export function rectifierCycleAtAngle(peakV: number, alphaRad: number, resistanceOhm: number): RectifierCycle {
  const E = Math.abs(peakV);
  const sinA = Math.sin(alphaRad);
  const cosA = Math.cos(alphaRad);
  const u = E * sinA;
  const w = Math.PI - 2 * alphaRad;
  const sinSq = w / 2 + sinA * cosA;
  return {
    meanA: (2 * E * cosA - u * w) / (Math.PI * resistanceOhm),
    meanSquareA2: (E * E * sinSq - 4 * u * E * cosA + u * u * w) / (Math.PI * resistanceOhm ** 2),
    meanPowerW: (E * E * sinSq - 2 * u * E * cosA) / (Math.PI * resistanceOhm),
  };
}

/**
 * cot α − (π/2 − α): the mean current over a cycle is 2u·h(α)/(πR). Falls
 * from infinity at α = 0 to zero at α = π/2, where the rectifier stops
 * conducting. Averaged mode parameterises its balances by α through this.
 */
export function conductionShape(alphaRad: number): number {
  return Math.cos(alphaRad) / Math.sin(alphaRad) - (Math.PI / 2 - alphaRad);
}

/** The α at which `conductionShape` equals `target`, rad. `target` ≥ 0. */
export function conductionAngleForShape(target: number): number {
  return solveDecreasing((a) => conductionShape(a) - target, 0, Math.PI / 2);
}
