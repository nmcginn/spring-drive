// The glide wheel coasting to a stop, with the mainspring out of the way:
// what the lenz-brake widget shows (PHYSICS.md, D10). The wheel is spun up
// and let go, and only friction and the coil slow it. The coil is either
// open, when no current flows and it does nothing, or shorted, for a
// fraction `duty` of the time, when the current its EMF drives brakes the
// wheel with k_e²·ω/R (decision 20). Nothing else is connected: no
// rectifier, no capacitor, no IC. That is the brake on its own, before the
// loop section lets the IC work the switch.
//
// The integrator is detailed mode's: fixed steps of `params.stepS`,
// semi-implicit Euler through `nextOmegaRadS`, so a wheel slowing to rest
// stops rather than reversing, and a wheel at rest stays there. Energy is
// booked at each step's mean speed, which for semi-implicit Euler makes the
// ledger close exactly: J·(ω₁ − ω₀) = −τ·dt, so ½J(ω₁² − ω₀²) = −τ·dt·(ω₀ + ω₁)/2.

import { emfV, maxBrakeTorqueNm } from './generator.ts';
import { frictionTorqueNm, nextOmegaRadS, rotorKineticEnergyJ } from './rotor.ts';
import type { SimParams } from './types.ts';

export interface CoastState {
  /** Whole steps since the wheel was let go. Time is derived from it, so it never drifts. */
  step: number;
  /** Time since the wheel was let go, s. */
  timeS: number;
  /** Unwrapped glide wheel angle, rad. */
  rotorAngleRad: number;
  rotorOmegaRadS: number;
  /** The moment the wheel came to rest, located within its step, s. Null while it turns. */
  stoppedAtS: number | null;
  /** Heat so far in the pivots and the train's oil, J. */
  frictionJ: number;
  /** Heat so far in the coil's resistance, J. */
  coilJ: number;
}

/** The wheel at `omegaRadS`, just let go. */
export function createCoast(omegaRadS: number, rotorAngleRad = 0): CoastState {
  const omega = Math.max(0, omegaRadS);
  return {
    step: 0,
    timeS: 0,
    rotorAngleRad,
    rotorOmegaRadS: omega,
    stoppedAtS: omega > 0 ? null : 0,
    frictionJ: 0,
    coilJ: 0,
  };
}

function clampDuty(duty: number): number {
  return Number.isFinite(duty) ? Math.min(1, Math.max(0, duty)) : 0;
}

/**
 * Brake torque with the coil shorted for a fraction `duty` of the time, N·m:
 * duty × k_e²·ω/R, which is PLAN.md's k_e²·ω/R_eff with R_eff = R/duty.
 */
export function coastBrakeTorqueNm(omegaRadS: number, duty: number, params: SimParams): number {
  return clampDuty(duty) * maxBrakeTorqueNm(omegaRadS, params);
}

/** Mean current around the coil, A: e/R while shorted, none while open. */
export function coastCoilCurrentA(omegaRadS: number, duty: number, params: SimParams): number {
  return (clampDuty(duty) * emfV(omegaRadS, params)) / params.coilResistanceOhm;
}

/** Friction on the coasting wheel, N·m: running friction while it turns, none at rest (nothing drives it). */
export function coastFrictionTorqueNm(omegaRadS: number, params: SimParams): number {
  return omegaRadS > 0 ? frictionTorqueNm(omegaRadS, params) : 0;
}

/** One step of `params.stepS`, with the coil shorted a fraction `duty` of the time. */
export function stepCoast(state: CoastState, duty: number, params: SimParams): CoastState {
  const dtS = params.stepS;
  const step = state.step + 1;
  const timeS = step * dtS;
  const w0 = state.rotorOmegaRadS;
  if (w0 <= 0) return { ...state, step, timeS };

  const brakeNm = coastBrakeTorqueNm(w0, duty, params);
  const frictionNm = frictionTorqueNm(w0, params);
  const w1 = nextOmegaRadS(w0, 0, brakeNm, dtS, params);
  if (w1 > 0) {
    const turnedRad = ((w0 + w1) / 2) * dtS;
    return {
      ...state,
      step,
      timeS,
      rotorAngleRad: state.rotorAngleRad + w1 * dtS,
      rotorOmegaRadS: w1,
      frictionJ: state.frictionJ + frictionNm * turnedRad,
      coilJ: state.coilJ + brakeNm * turnedRad,
    };
  }
  // The wheel reaches rest inside this step. At the step's torques it takes
  // J·ω₀/τ to stop, turning ω₀/2 on average meanwhile, so the heat booked is
  // exactly the kinetic energy it had.
  const stopS = (params.rotorInertiaKgM2 * w0) / (brakeNm + frictionNm);
  const turnedRad = (w0 / 2) * stopS;
  return {
    ...state,
    step,
    timeS,
    rotorAngleRad: state.rotorAngleRad + turnedRad,
    rotorOmegaRadS: 0,
    stoppedAtS: state.timeS + stopS,
    frictionJ: state.frictionJ + frictionNm * turnedRad,
    coilJ: state.coilJ + brakeNm * turnedRad,
  };
}

/**
 * Advance by `durationS`, in whole steps. Time too short for another step
 * comes back as `carryS`; pass it in next time, so frame after frame the
 * coast keeps sim time exactly, as `advanceDetailed` does.
 */
export function advanceCoast(
  state: CoastState,
  duty: number,
  params: SimParams,
  durationS: number,
  carryS = 0,
): { state: CoastState; carryS: number } {
  const totalS = Math.max(0, Number.isFinite(durationS) ? durationS : 0) + carryS;
  const steps = Math.floor(totalS / params.stepS);
  let s = state;
  for (let i = 0; i < steps && s.stoppedAtS === null; i++) s = stepCoast(s, duty, params);
  // A wheel at rest stays at rest: skip the steps, but keep the clock.
  if (s.stoppedAtS !== null && s.step < state.step + steps) {
    const step = state.step + steps;
    s = { ...s, step, timeS: step * params.stepS };
  }
  return { state: s, carryS: totalS - steps * params.stepS };
}

/** Kinetic energy of the coasting wheel, J. */
export function coastKineticEnergyJ(state: CoastState, params: SimParams): number {
  return rotorKineticEnergyJ(state.rotorOmegaRadS, params);
}

export interface SpinDownPoint {
  timeS: number;
  omegaRadS: number;
}

/**
 * A whole spin-down from `omegaRadS` at a fixed duty: the speed every
 * `sampleIntervalS` (rounded to whole steps), ending with the moment the
 * wheel stops, at zero. `maxS` bounds the run for a wheel that never
 * stops, which with any friction at all does not happen.
 */
export function spinDown(
  omegaRadS: number,
  duty: number,
  params: SimParams,
  sampleIntervalS: number,
  maxS = 60,
): { points: SpinDownPoint[]; stopS: number | null } {
  const every = Math.max(1, Math.round(sampleIntervalS / params.stepS));
  const maxSteps = Math.ceil(maxS / params.stepS);
  let s = createCoast(omegaRadS);
  const points: SpinDownPoint[] = [{ timeS: 0, omegaRadS: s.rotorOmegaRadS }];
  while (s.stoppedAtS === null && s.step < maxSteps) {
    s = stepCoast(s, duty, params);
    if (s.stoppedAtS !== null) points.push({ timeS: s.stoppedAtS, omegaRadS: 0 });
    else if (s.step % every === 0) points.push({ timeS: s.timeS, omegaRadS: s.rotorOmegaRadS });
  }
  return { points, stopS: s.stoppedAtS };
}

/** How long the wheel coasts from `omegaRadS` to rest at a fixed duty, s. */
export function spinDownTimeS(omegaRadS: number, duty: number, params: SimParams, maxS = 60): number | null {
  return spinDown(omegaRadS, duty, params, maxS, maxS).stopS;
}
