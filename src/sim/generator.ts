// The generator: the glide wheel's magnet turning past the coil.
//
// The coil feeds two paths, chosen by the regulator's switch, which chops
// far faster than the wheel turns (PHYSICS.md, step 4):
// - For a fraction `duty` of the time the coil is shorted. Current e/R flows
//   and brakes the wheel with torque k_e²·ω/R, all of it lost as heat in the
//   coil. This is PLAN.md's τ_brake = k_e²·ω/R_eff, with R_eff = R/duty.
// - The rest of the time it charges the capacitor through the rectifier,
//   and only while its EMF exceeds the capacitor voltage plus the drop.
//
// The EMF is modelled by its rectified mean, e = k_e·ω, averaged over each
// electrical cycle. Both the cycle and the chopping are much faster than
// the wheel's speed can change, so the dynamics see only the averages.

import type { SimParams } from './types.ts';

/** Rectified-mean EMF, V. */
export function emfV(omegaRadS: number, params: SimParams): number {
  return params.generatorKeVSRad * Math.abs(omegaRadS);
}

// The waveform itself (PHYSICS.md, D9). Only the generator widget draws it;
// the dynamics above use its rectified mean, and nothing here changes them.
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

export interface CoilCurrents {
  /** Time-averaged current into the capacitor through the rectifier, A. */
  chargeA: number;
  /** Time-averaged current around the shorted coil, A. */
  brakeA: number;
  /** Current while the rectifier conducts (before averaging by 1 − duty), A. */
  chargeOnA: number;
}

export function coilCurrents(omegaRadS: number, capVoltageV: number, duty: number, params: SimParams): CoilCurrents {
  const e = emfV(omegaRadS, params);
  const chargeOnA = Math.max(0, (e - capVoltageV - params.rectifierDropV) / params.coilResistanceOhm);
  return {
    chargeA: (1 - duty) * chargeOnA,
    brakeA: (duty * e) / params.coilResistanceOhm,
    chargeOnA,
  };
}

/** Torque the coil's current puts on the glide wheel, opposing its motion, N·m. */
export function generatorTorqueNm(currents: CoilCurrents, params: SimParams): number {
  return params.generatorKeVSRad * (currents.chargeA + currents.brakeA);
}

/** The largest brake torque the coil can make at `omegaRadS`: duty 1, N·m. */
export function maxBrakeTorqueNm(omegaRadS: number, params: SimParams): number {
  return (params.generatorKeVSRad ** 2 * Math.abs(omegaRadS)) / params.coilResistanceOhm;
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
    coilW: params.coilResistanceOhm * (duty * shortedA ** 2 + (1 - duty) * currents.chargeOnA ** 2),
    rectifierW: params.rectifierDropV * currents.chargeA,
  };
}
