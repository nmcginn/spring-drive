// The generator: the glide wheel's magnet turning past the coil.
//
// The coil feeds two paths, chosen by the regulator's switch, which chops
// far faster than the wheel turns (PHYSICS.md, step 4):
// - For a fraction `duty` of the time the coil is shorted. Current e/R flows
//   and brakes the wheel, all of it lost as heat in the coil. The heat is the
//   sine EMF's mean square over R, so the torque is (π²/8)·k_e²·ω/R: PLAN.md's
//   τ_brake = k_e²·ω/R_eff, with R_eff = R/(duty·π²/8) (decision 35).
// - The rest of the time it charges the capacitor through the rectifier,
//   which conducts only near the sine's peaks, while |e| exceeds the
//   capacitor voltage plus the drop (`rectifier.ts`, decision 37).
//
// Both paths are averaged over the EMF's cycle and the switch's chopping,
// which are much faster than the wheel's speed can change, so the dynamics
// see only the means (decision 20). `emfV` is the rectified mean, k_e·ω.

import { rectifierCycle } from './rectifier.ts';
import type { SimParams } from './types.ts';

/** Rectified-mean EMF, V. */
export function emfV(omegaRadS: number, params: SimParams): number {
  return params.generatorKeVSRad * Math.abs(omegaRadS);
}

// The waveform itself (PHYSICS.md, D9). The generator widget draws it, and
// its peak and mean square set the charging path and the brake above.
//
// The coil's flux linkage is taken as sinusoidal in the magnet's angle,
// λ = Λ·cos(p·θ), with θ = 0 where a north pole faces the coil. Its EMF is
// e = −dλ/dt = Λ·p·ω·sin(p·θ): zero as a pole passes the coil, largest a
// quarter of a pole pitch later, where the flux is changing fastest. A sine's
// rectified mean is 2/π of its peak, so matching the mean to k_e·ω fixes the
// peak at (π/2)·k_e·ω.

/** Ratio of a sine's peak to its rectified mean, π/2. A property of the sine, not a parameter. */
export const SINE_PEAK_TO_MEAN = Math.PI / 2;

/** Instantaneous EMF across the coil, V, with the magnet at `rotorAngleRad` turning at `omegaRadS`. */
export function instantaneousEmfV(rotorAngleRad: number, omegaRadS: number, params: SimParams): number {
  return SINE_PEAK_TO_MEAN * params.generatorKeVSRad * omegaRadS * Math.sin(params.generatorPolePairs * rotorAngleRad);
}

/** Peak of the EMF over a cycle, V. */
export function peakEmfV(omegaRadS: number, params: SimParams): number {
  return SINE_PEAK_TO_MEAN * emfV(omegaRadS, params);
}

/** Frequency of the EMF, Hz: one cycle per pole pair per turn. */
export function emfFrequencyHz(omegaRadS: number, params: SimParams): number {
  return (params.generatorPolePairs * Math.abs(omegaRadS)) / (2 * Math.PI);
}

/**
 * A sine's mean square over its rectified mean squared, π²/8 ≈ 1.2337: the
 * square of its form factor. A property of the sine, not a parameter. Heat in
 * a resistance goes as the mean square, so a shorted coil with the D9 sine
 * brakes this much harder than its mean EMF alone would suggest.
 */
export const SINE_MEAN_SQUARE_TO_MEAN_SQUARED = Math.PI ** 2 / 8;

export interface CoilCurrents {
  /** Time-averaged current into the capacitor through the rectifier, A. */
  chargeA: number;
  /** Time-averaged magnitude of the current around the shorted coil, A. */
  brakeA: number;
  /** Mean charging current over a cycle while the coil is not shorted (before averaging by 1 − duty), A. */
  chargeOnA: number;
  /** Mean square of that current over a cycle, A². */
  chargeOnMeanSquareA2: number;
  /** Time-averaged power the EMF delivers into the charging path, W. */
  chargeW: number;
}

export function coilCurrents(omegaRadS: number, capVoltageV: number, duty: number, params: SimParams): CoilCurrents {
  const cycle = rectifierCycle(
    peakEmfV(omegaRadS, params),
    capVoltageV + params.rectifierDropV,
    params.coilResistanceOhm,
  );
  return {
    chargeA: (1 - duty) * cycle.meanA,
    brakeA: (duty * emfV(omegaRadS, params)) / params.coilResistanceOhm,
    chargeOnA: cycle.meanA,
    chargeOnMeanSquareA2: cycle.meanSquareA2,
    chargeW: (1 - duty) * cycle.meanPowerW,
  };
}

/**
 * Torque the coil's current puts on the glide wheel, opposing its motion, N·m.
 * Each path takes from the wheel the power it draws from the EMF, so its
 * torque is that power over ω. The shorted coil's current is in phase with
 * its EMF, largest where the coupling is strongest, so its torque is π²/8
 * times k_e times its mean. The charging current flows only near the peaks,
 * where the coupling is strongest too, so its torque is its power over ω,
 * not k_e times its mean.
 */
export function generatorTorqueNm(currents: CoilCurrents, omegaRadS: number, params: SimParams): number {
  const brakeNm = params.generatorKeVSRad * SINE_MEAN_SQUARE_TO_MEAN_SQUARED * currents.brakeA;
  // No charging power flows unless the peak beats the rectifier's drop, which is above zero at ω = 0.
  const speed = Math.abs(omegaRadS);
  return brakeNm + (currents.chargeW > 0 && speed > 0 ? currents.chargeW / speed : 0);
}

/** The largest brake torque the coil can make at `omegaRadS`: duty 1, N·m. */
export function maxBrakeTorqueNm(omegaRadS: number, params: SimParams): number {
  return (
    (SINE_MEAN_SQUARE_TO_MEAN_SQUARED * params.generatorKeVSRad ** 2 * Math.abs(omegaRadS)) / params.coilResistanceOhm
  );
}

/**
 * Power turned to heat by the coil currents, W: the coil's resistance and the
 * rectifier's drop. Whatever else the EMF delivers goes into the capacitor.
 */
export function coilLossesW(
  currents: CoilCurrents,
  duty: number,
  params: SimParams,
): { coilW: number; rectifierW: number } {
  const shortedA = duty > 0 ? currents.brakeA / duty : 0;
  return {
    coilW:
      params.coilResistanceOhm *
      (duty * SINE_MEAN_SQUARE_TO_MEAN_SQUARED * shortedA ** 2 + (1 - duty) * currents.chargeOnMeanSquareA2),
    rectifierW: params.rectifierDropV * currents.chargeA,
  };
}
