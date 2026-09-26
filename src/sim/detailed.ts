// Detailed mode: the whole movement stepped at a fixed 4,096 Hz (decision 19),
// fine enough to draw individual turns of the glide wheel, the brake duty
// changing at each reference tick, and the capacitor charging.
//
// Every step does, in order: evaluate torques and coil currents at the start
// of the step; update the glide wheel's speed, then its angle from the new
// speed (semi-implicit Euler); unwind the barrel by the angle turned; update
// the capacitor and the IC's power state; and, if the crystal count reaches a
// reference tick, run the regulator. Each energy flow is booked from its own
// formula as it happens, so test 5 can check that they balance.

import { barrelAngleForRotorRad, reflectedDriveTorqueNm } from './train.ts';
import { coilCurrents, coilLossesW, generatorTorqueNm } from './generator.ts';
import { capEnergyJ, icCurrentA, nextCapVoltageV, nextIcOn } from './power.ts';
import { cyclesPerReferenceTick, cyclesPerStep, referencePhaseRad } from './quartz.ts';
import { nextOmegaRadS, rotorKineticEnergyJ, stepFrictionTorqueNm } from './rotor.ts';
import { fullWindAngleRad, mainspringEnergyJ, mainspringTorqueNm } from './mainspring.ts';
import { regulatorUpdate } from './regulator.ts';
import type { EnergyLedger, Sample, Scenario, SimControls, SimParams, SimState } from './types.ts';

/**
 * Reject parameter sets the stepper cannot represent exactly. The divider
 * must be whole stages, and each step a whole number of crystal cycles, so
 * that reference ticks land exactly on step boundaries.
 */
export function validateParams(params: SimParams): void {
  if (!Number.isInteger(params.referenceDividerStages) || params.referenceDividerStages < 0) {
    throw new RangeError(`referenceDividerStages must be a whole number, got ${params.referenceDividerStages}`);
  }
  const cycles = cyclesPerStep(params);
  if (!Number.isInteger(cycles) || cycles < 1) {
    throw new RangeError(`stepS must be a whole number of crystal cycles, got ${cycles} cycles`);
  }
  if (cyclesPerReferenceTick(params) % cycles !== 0) {
    throw new RangeError('A reference tick must be a whole number of steps');
  }
  if (params.icStartV < params.icBrownoutV) {
    throw new RangeError('The IC must start at or above its brownout voltage');
  }
}

export interface InitialConditions {
  /** Fraction of full wind, 0 to 1. Default: fully wound. */
  windFraction?: number;
  /** Default: at rest. */
  rotorOmegaRadS?: number;
  /** Default: discharged. */
  capVoltageV?: number;
}

function emptyLedger(): EnergyLedger {
  return { springJ: 0, trainLossJ: 0, frictionJ: 0, coilJ: 0, rectifierJ: 0, icJ: 0, shockJ: 0 };
}

export function createState(params: SimParams, initial: InitialConditions = {}): SimState {
  validateParams(params);
  const capVoltageV = initial.capVoltageV ?? 0;
  const icOn = nextIcOn(false, capVoltageV, params);
  return {
    step: 0,
    timeS: 0,
    rotorAngleRad: 0,
    rotorOmegaRadS: initial.rotorOmegaRadS ?? 0,
    barrelAngleRad: (initial.windFraction ?? 1) * fullWindAngleRad(params),
    capVoltageV,
    regulator: {
      icOn,
      quartzCycles: 0,
      referenceOriginRad: 0,
      integralRadS: 0,
      duty: 0,
      lastPhaseErrorRad: 0,
    },
    energy: emptyLedger(),
  };
}

function cloneState(state: SimState): SimState {
  return { ...state, regulator: { ...state.regulator }, energy: { ...state.energy } };
}

/** One fixed step, in place. Only ever called on a private copy. */
function stepInPlace(s: SimState, params: SimParams, controls: SimControls): void {
  const dtS = params.stepS;
  const reg = s.regulator;
  const omega0 = s.rotorOmegaRadS;
  const duty = controls.brakeEnabled && reg.icOn ? reg.duty : 0;

  // Torques and currents at the start of the step.
  const driveNm = reflectedDriveTorqueNm(mainspringTorqueNm(s.barrelAngleRad, params), params);
  const currents = coilCurrents(omega0, s.capVoltageV, duty, params);
  const generatorNm = generatorTorqueNm(currents, params);

  // Glide wheel: speed first, then angle from the new speed.
  const omega1 = nextOmegaRadS(omega0, driveNm, generatorNm, dtS, params);
  const turnedRad = omega1 * dtS;
  s.rotorOmegaRadS = omega1;
  s.rotorAngleRad += turnedRad;

  // Barrel: exact energy released over the angle it unwound.
  const barrel1 = Math.max(0, s.barrelAngleRad - barrelAngleForRotorRad(turnedRad, params));
  const releasedJ = mainspringEnergyJ(s.barrelAngleRad, params) - mainspringEnergyJ(barrel1, params);
  s.barrelAngleRad = barrel1;

  // Mechanical losses over the step, at the step's mean speed, which is the
  // speed that makes ½J(ω₁² − ω₀²) equal the net work.
  const meanOmega = (omega0 + omega1) / 2;
  const e = s.energy;
  e.springJ += releasedJ;
  e.trainLossJ += (1 - params.trainEfficiency) * releasedJ;
  e.frictionJ += stepFrictionTorqueNm(omega0, params) * meanOmega * dtS;

  // Electrical: coil and rectifier heat, then the capacitor and the IC.
  const losses = coilLossesW(currents, duty, params);
  e.coilJ += losses.coilW * dtS;
  e.rectifierJ += losses.rectifierW * dtS;
  const loadA = icCurrentA(reg.icOn, s.capVoltageV, params);
  if (reg.icOn) e.icJ += params.icPowerW * dtS;
  s.capVoltageV = nextCapVoltageV(s.capVoltageV, currents.chargeA, loadA, dtS, params);

  // The IC: start, stop, or count crystal cycles toward the next tick.
  const icOn = nextIcOn(reg.icOn, s.capVoltageV, params);
  if (icOn && !reg.icOn) {
    // Power-on: the counters start from zero, so the reference begins wherever
    // the glide wheel is. See decision 19.
    reg.quartzCycles = 0;
    reg.referenceOriginRad = s.rotorAngleRad;
    reg.integralRadS = 0;
    reg.duty = 0;
    reg.lastPhaseErrorRad = 0;
  } else if (!icOn) {
    reg.duty = 0;
  } else {
    reg.quartzCycles += cyclesPerStep(params);
    if (reg.quartzCycles % cyclesPerReferenceTick(params) === 0) {
      const phaseErrorRad = s.rotorAngleRad - referencePhaseRad(reg.referenceOriginRad, reg.quartzCycles, params);
      const previousRad = reg.lastPhaseErrorRad;
      reg.lastPhaseErrorRad = phaseErrorRad;
      if (controls.brakeEnabled) {
        const out = regulatorUpdate(reg.integralRadS, phaseErrorRad, previousRad, params);
        reg.integralRadS = out.integralRadS;
        reg.duty = out.duty;
      } else {
        reg.duty = 0;
      }
    }
  }
  reg.icOn = icOn;

  s.step += 1;
  s.timeS = s.step * dtS;
}

/** Advance by a whole number of steps. Returns a new state; the input is untouched. */
export function advanceSteps(state: SimState, params: SimParams, controls: SimControls, steps: number): SimState {
  const s = cloneState(state);
  for (let i = 0; i < steps; i++) stepInPlace(s, params, controls);
  return s;
}

/** One step. */
export function stepDetailed(state: SimState, params: SimParams, controls: SimControls): SimState {
  return advanceSteps(state, params, controls, 1);
}

/**
 * Advance by `durationS` of sim time, as a whole number of steps. The part of
 * `durationS` too short for another step comes back as `carryS`; pass it in
 * with the next call, so a widget stepping once per frame keeps sim time in
 * step with the frames it was given.
 */
export function advanceDetailed(
  state: SimState,
  params: SimParams,
  controls: SimControls,
  durationS: number,
  carryS = 0,
): { state: SimState; carryS: number } {
  const totalS = Math.max(0, durationS) + carryS;
  const steps = Math.floor(totalS / params.stepS);
  return { state: advanceSteps(state, params, controls, steps), carryS: totalS - steps * params.stepS };
}

/**
 * A shock: an instantaneous change in glide wheel speed, as from a knock to
 * the watch. The wheel cannot be driven backwards, so speed stops at zero.
 */
export function applyShock(state: SimState, deltaOmegaRadS: number, params: SimParams): SimState {
  const s = cloneState(state);
  const omega1 = Math.max(0, s.rotorOmegaRadS + deltaOmegaRadS);
  s.energy.shockJ += rotorKineticEnergyJ(omega1, params) - rotorKineticEnergyJ(s.rotorOmegaRadS, params);
  s.rotorOmegaRadS = omega1;
  return s;
}

/**
 * How far the glide wheel is ahead of the reference right now, rad. The
 * regulator only acts on this at ticks; this is the continuous value a
 * phase scope would draw. Zero while the IC is off, since then there is no
 * reference.
 */
export function phaseErrorRad(state: SimState, params: SimParams): number {
  const reg = state.regulator;
  if (!reg.icOn) return 0;
  return state.rotorAngleRad - referencePhaseRad(reg.referenceOriginRad, reg.quartzCycles, params);
}

/**
 * Restart the reference from wherever the glide wheel is now, as a power-on
 * does, clearing the controller's memory. A widget calls this when it turns
 * regulation back on, so the loop starts from zero error rather than trying
 * to repay every turn the wheel ran ahead while unregulated.
 */
export function realignReference(state: SimState): SimState {
  const s = cloneState(state);
  s.regulator.quartzCycles = 0;
  s.regulator.referenceOriginRad = s.rotorAngleRad;
  s.regulator.integralRadS = 0;
  s.regulator.duty = 0;
  s.regulator.lastPhaseErrorRad = 0;
  return s;
}

/** Energy stored in the movement right now: spring, glide wheel, capacitor, J. */
export function storedEnergyJ(state: SimState, params: SimParams): { springJ: number; kineticJ: number; capJ: number } {
  return {
    springJ: mainspringEnergyJ(state.barrelAngleRad, params),
    kineticJ: rotorKineticEnergyJ(state.rotorOmegaRadS, params),
    capJ: capEnergyJ(state.capVoltageV, params),
  };
}

export function sampleOf(state: SimState, params: SimParams): Sample {
  return {
    timeS: state.timeS,
    rotorAngleRad: state.rotorAngleRad,
    rotorOmegaRadS: state.rotorOmegaRadS,
    barrelAngleRad: state.barrelAngleRad,
    capVoltageV: state.capVoltageV,
    icOn: state.regulator.icOn,
    duty: state.regulator.icOn ? state.regulator.duty : 0,
    phaseErrorRad: phaseErrorRad(state, params),
  };
}

/**
 * Run a scenario from start to finish. Shocks land at the first step at or
 * after their time. Samples are taken at t = 0 and every sample interval.
 */
export function runScenario(scenario: Scenario): { samples: Sample[]; final: SimState } {
  const { params, controls } = scenario;
  validateParams(params);
  const totalSteps = Math.round(scenario.durationS / params.stepS);
  const sampleEvery = Math.max(1, Math.round(scenario.sampleIntervalS / params.stepS));
  const shocks = [...scenario.shocks].sort((a, b) => a.timeS - b.timeS);
  let nextShock = 0;
  let s = cloneState(scenario.initial);
  const samples: Sample[] = [sampleOf(s, params)];
  for (let i = 0; i < totalSteps; i++) {
    for (let shock = shocks[nextShock]; shock && shock.timeS <= s.timeS; shock = shocks[nextShock]) {
      s = applyShock(s, shock.deltaOmegaRadS, params);
      nextShock++;
    }
    stepInPlace(s, params, controls);
    if (s.step % sampleEvery === 0) samples.push(sampleOf(s, params));
  }
  return { samples, final: s };
}
