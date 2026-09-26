// The glide wheel as a rigid body: J·dω/dt = τ_drive − τ_friction(ω) − τ_generator.
//
// Friction (PHYSICS.md, D3) is Coulomb plus viscous, with a Stribeck term:
// breakaway friction at rest is higher than running friction, and the excess
// fades with speed as the oil film builds. Without it a dying spring never
// quite stops the wheel: its speed would fall in proportion to the torque
// left above Coulomb friction, approaching zero exponentially for hours. With
// it, friction rises as the wheel slows, and below a certain drive the wheel
// stalls outright, as real movements do.
//
// The spring only ever drives the wheel forwards and every other torque
// opposes its motion, so the wheel never reverses: it stops and sticks.

import type { SimParams } from './types.ts';

/** Friction at the glide wheel while it turns at `omegaRadS` > 0, N·m. At rest, see `breakawayTorqueNm`. */
export function frictionTorqueNm(omegaRadS: number, params: SimParams): number {
  if (omegaRadS <= 0) return 0;
  const stribeckNm =
    (params.frictionStaticNm - params.frictionCoulombNm) * Math.exp(-omegaRadS / params.frictionStribeckRadS);
  return params.frictionCoulombNm + stribeckNm + params.frictionViscousNmSRad * omegaRadS;
}

/** Torque needed to start a stopped wheel, N·m: the limit of friction as speed falls to zero. */
export function breakawayTorqueNm(params: SimParams): number {
  return params.frictionStaticNm;
}

/**
 * Speed after one step of `dtS`, given the drive torque and the generator's
 * opposing torque (both N·m, both evaluated at the start of the step).
 * Explicit in the torques, so with the position update that follows it the
 * step is semi-implicit Euler. A stopped wheel stays stopped until the drive
 * beats breakaway friction, and a slowing wheel stops at zero rather than
 * reversing.
 */
export function nextOmegaRadS(
  omegaRadS: number,
  driveTorqueNm: number,
  generatorTorqueNm: number,
  dtS: number,
  params: SimParams,
): number {
  const netDriveNm = driveTorqueNm - generatorTorqueNm;
  if (omegaRadS <= 0) {
    const breakawayNm = breakawayTorqueNm(params);
    if (netDriveNm <= breakawayNm) return 0;
    return ((netDriveNm - breakawayNm) / params.rotorInertiaKgM2) * dtS;
  }
  const next = omegaRadS + ((netDriveNm - frictionTorqueNm(omegaRadS, params)) / params.rotorInertiaKgM2) * dtS;
  return Math.max(0, next);
}

/** Friction acting over a step that starts at `omegaRadS`: running friction, or breakaway if starting from rest. */
export function stepFrictionTorqueNm(omegaRadS: number, params: SimParams): number {
  return omegaRadS > 0 ? frictionTorqueNm(omegaRadS, params) : breakawayTorqueNm(params);
}

/** Kinetic energy of the glide wheel, J. */
export function rotorKineticEnergyJ(omegaRadS: number, params: SimParams): number {
  return 0.5 * params.rotorInertiaKgM2 * omegaRadS * omegaRadS;
}

/**
 * The speed at which running friction is lowest, rad/s (PHYSICS.md, D3).
 * Below it, friction rises as the wheel slows, so a drive weaker than the
 * friction here has no running speed to settle at and the wheel stalls.
 * Zero when the Stribeck excess is too small to make a dip at all.
 */
export function frictionMinimumOmegaRadS(params: SimParams): number {
  const excessNm = params.frictionStaticNm - params.frictionCoulombNm;
  const ratio = excessNm / (params.frictionStribeckRadS * params.frictionViscousNmSRad);
  return ratio > 1 ? params.frictionStribeckRadS * Math.log(ratio) : 0;
}
