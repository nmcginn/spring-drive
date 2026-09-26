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
