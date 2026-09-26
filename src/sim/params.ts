// Every physical constant the simulation uses, and every numerical choice
// that decides what its numbers mean. Each export has a row in PHYSICS.md
// with its label (published, derived, or assumption), and
// tests/sim/params-coverage.test.ts fails if one does not, or if the values
// disagree. The order follows PLAN.md's derivation order, so each value only
// depends on the ones above it.

import type { SimParams, TorqueCurve } from './types.ts';
import { DAYS_PER_MONTH, SECONDS_PER_HOUR, TAU, revSToRadS } from './units.ts';

// Published anchors -----------------------------------------------------------

export const ROTOR_TARGET_REV_S = 8;
export const QUARTZ_HZ = 32_768;
export const POWER_RESERVE_H = 72;
export const RATED_ACCURACY_S_PER_MONTH = 15;

export const ROTOR_TARGET_OMEGA_RAD_S = revSToRadS(ROTOR_TARGET_REV_S);
export const POWER_RESERVE_S = POWER_RESERVE_H * SECONDS_PER_HOUR;
export const RATED_ACCURACY_S_PER_DAY = RATED_ACCURACY_S_PER_MONTH / DAYS_PER_MONTH;

/** Halvings from the crystal to one reference tick per glide wheel turn. */
export const REFERENCE_DIVIDER_STAGES = Math.log2(QUARTZ_HZ / ROTOR_TARGET_REV_S);
export const REFERENCE_HZ = QUARTZ_HZ / 2 ** REFERENCE_DIVIDER_STAGES;

// 1. Barrel and train ---------------------------------------------------------

export const BARREL_TURNS_FULL = 7;
export const GEAR_RATIO = (ROTOR_TARGET_REV_S * POWER_RESERVE_S) / BARREL_TURNS_FULL;
export const TRAIN_EFFICIENCY = 0.6;

// 2. Mainspring ---------------------------------------------------------------

/** (fraction of full wind, barrel torque in N·m). See PHYSICS.md for the shape. */
export const MAINSPRING_TORQUE_CURVE: TorqueCurve = [
  [0, 0],
  [0.03, 0.008],
  [0.1, 0.0105],
  [0.5, 0.012],
  [0.9, 0.0132],
  [0.97, 0.0145],
  [1, 0.016],
];

// 3. Glide wheel --------------------------------------------------------------

export const ROTOR_INERTIA_KG_M2 = 1e-10;
export const FRICTION_COULOMB_NM = 1.5e-9;
export const FRICTION_VISCOUS_NM_S_RAD = 1.6e-10;
export const FRICTION_STATIC_NM = 3e-9;
export const FRICTION_STRIBECK_RAD_S = 1;

// 4. Generator ----------------------------------------------------------------

export const GENERATOR_EMF_AT_TARGET_V = 1;
export const GENERATOR_KE_V_S_RAD = GENERATOR_EMF_AT_TARGET_V / ROTOR_TARGET_OMEGA_RAD_S;
export const COIL_RESISTANCE_OHM = 100_000;
export const RECTIFIER_DROP_V = 0.2;

// 5. Power supply and IC ------------------------------------------------------

export const IC_POWER_W = 25e-9;
export const IC_BROWNOUT_V = 0.6;
export const IC_START_V = 0.75;
export const CAPACITANCE_F = 1e-7;

// The comparison watch ---------------------------------------------------------

/**
 * Beats per second of the ordinary mechanical watch the intro sets beside the
 * Spring Drive: 28,800 vibrations an hour. Not part of the Spring Drive model;
 * nothing in the simulation reads it.
 */
export const MECHANICAL_BEAT_HZ = 8;

// Model choices ---------------------------------------------------------------

/** 2⁻¹² s: 4,096 steps per second, 8 crystal cycles per step, 512 per reference tick. */
export const DETAILED_STEP_S = 1 / 4096;
/**
 * Averaged mode's longest step, s. Regime changes inside a step (catching up
 * to the reference, a brownout) are located exactly, so this only sets how
 * finely the slow unwinding of the spring is followed.
 */
export const AVERAGED_STEP_S = 1;
export const REGULATOR_KP_PER_RAD = 0.02;
export const REGULATOR_KI_PER_RAD_S = 0.02;
export const REGULATOR_KD_PER_RAD_S = 0.004;

/** A shock the size tests and widgets use: a quarter of the target speed. */
export const SHOCK_DELTA_OMEGA_RAD_S = ROTOR_TARGET_OMEGA_RAD_S / 4;

/** Lock: speed over each reference period within this fraction of target… */
export const LOCK_SPEED_TOLERANCE = 0.001;
/** …and phase error at each reference tick within this, rad. */
export const LOCK_PHASE_TOLERANCE_RAD = TAU / 100;

export const DEFAULT_PARAMS: SimParams = Object.freeze({
  rotorTargetOmegaRadS: ROTOR_TARGET_OMEGA_RAD_S,
  quartzHz: QUARTZ_HZ,
  referenceDividerStages: REFERENCE_DIVIDER_STAGES,
  barrelTurnsFull: BARREL_TURNS_FULL,
  gearRatio: GEAR_RATIO,
  trainEfficiency: TRAIN_EFFICIENCY,
  mainspringCurve: MAINSPRING_TORQUE_CURVE,
  rotorInertiaKgM2: ROTOR_INERTIA_KG_M2,
  frictionCoulombNm: FRICTION_COULOMB_NM,
  frictionViscousNmSRad: FRICTION_VISCOUS_NM_S_RAD,
  frictionStaticNm: FRICTION_STATIC_NM,
  frictionStribeckRadS: FRICTION_STRIBECK_RAD_S,
  generatorKeVSRad: GENERATOR_KE_V_S_RAD,
  coilResistanceOhm: COIL_RESISTANCE_OHM,
  rectifierDropV: RECTIFIER_DROP_V,
  capacitanceF: CAPACITANCE_F,
  icPowerW: IC_POWER_W,
  icBrownoutV: IC_BROWNOUT_V,
  icStartV: IC_START_V,
  regulatorKpPerRad: REGULATOR_KP_PER_RAD,
  regulatorKiPerRadS: REGULATOR_KI_PER_RAD_S,
  regulatorKdPerRadS: REGULATOR_KD_PER_RAD_S,
  stepS: DETAILED_STEP_S,
  averagedStepS: AVERAGED_STEP_S,
});
