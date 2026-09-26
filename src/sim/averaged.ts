// Averaged mode: the movement over hours and days, a step of about a second
// at a time (decision 23). Detailed mode at 4,096 Hz would need a billion
// steps for a 72 h run-down; this needs a quarter of a million.
//
// The model is quasi-steady. Everything detailed mode resolves inside a
// second settles far faster than the spring's torque changes: the glide
// wheel's speed within a few mechanical time constants (0.625 s), the
// capacitor within a few RC (10 ms), the regulator within a lock (about 4 s).
// So over each step the glide wheel turns at the speed where its torques
// balance, and the capacitor sits where its currents balance, given the
// spring's torque, the IC's state, and where the wheel is against the
// reference. Which balance applies is the regime (see `AveragedRegime`).
//
// Two things are tracked as state rather than settled, because they change
// slowly or on a threshold: the capacitor while the IC runs from it alone
// (holding back, or stalled), and the phase error while the wheel is off the
// reference. The moment either crosses a threshold (phase error back to zero,
// the capacitor down to brownout) is found exactly and the step is split
// there, so the step size only sets how finely the spring's unwinding is
// followed.
//
// Energy is booked from the same formulas as detailed mode, as steady flows.
// Kinetic energy and the capacitor's charge change in jumps between regimes,
// which the ledger does not book; see decision 23 for why that is small.

import { capEnergyJ } from './power.ts';
import { emfV } from './generator.ts';
import { mainspringEnergyJ, mainspringTorqueNm, fullWindAngleRad } from './mainspring.ts';
import { referenceHz } from './quartz.ts';
import { breakawayTorqueNm, frictionMinimumOmegaRadS, frictionTorqueNm } from './rotor.ts';
import { reflectedDriveTorqueNm } from './train.ts';
import { phaseErrorRad, validateParams } from './detailed.ts';
import type {
  AveragedRegime,
  AveragedScenario,
  AveragedState,
  EnergyLedger,
  Sample,
  SimControls,
  SimParams,
  SimState,
} from './types.ts';
import { TAU } from './units.ts';

/** Bisection halvings for a speed. 200 is far past double precision; the loop stops sooner when the bracket closes. */
const MAX_BISECTIONS = 200;

/**
 * Regime changes one step may contain. A step holds at most a power-on, a
 * catch-up or hold-back ending, and a brownout; more means the regimes are
 * cycling without time passing, which is a bug, so it throws rather than hangs.
 */
const MAX_EVENTS_PER_STEP = 16;

/** What the movement does from a given state, until `untilS` or the end of the step. */
export interface OperatingPoint {
  regime: AveragedRegime;
  omegaRadS: number;
  icOn: boolean;
  duty: number;
  /** Capacitor voltage over the step, or at its start while the IC runs from the capacitor alone, V. */
  capVoltageV: number;
  /** Phase error at the start of the step, after any power-on realignment, rad. */
  phaseErrorRad: number;
  /** Whether the IC is running from the capacitor alone, with nothing charging it. */
  capDraining: boolean;
  /** How long until this point ends in an event, s. Infinity if nothing ends it. */
  untilS: number;
  /** What happens at `untilS`. */
  event: 'none' | 'phase-zero' | 'brownout';
  /** Steady power flows, W, booked to the ledger. */
  coilW: number;
  rectifierW: number;
  icW: number;
}

/** Speed the reference turns at, rad/s: one turn per reference tick. */
export function referenceOmegaRadS(params: SimParams): number {
  return TAU * referenceHz(params);
}

/** Drive torque at the glide wheel with the barrel at this angle, N·m. */
export function driveTorqueNm(barrelAngleRad: number, params: SimParams): number {
  return reflectedDriveTorqueNm(mainspringTorqueNm(barrelAngleRad, params), params);
}

/**
 * Mean drive torque at the glide wheel while it turns through `turnedRad`
 * from this barrel angle, N·m: the exact energy the spring releases, less the
 * train's share, per radian. Using this rather than the torque at the start
 * of the step is what lets the ledger close to second order in the step.
 */
export function meanDriveTorqueNm(barrelAngleRad: number, turnedRad: number, params: SimParams): number {
  if (turnedRad <= 0) return driveTorqueNm(barrelAngleRad, params);
  const barrel1 = Math.max(0, barrelAngleRad - turnedRad / params.gearRatio);
  const releasedJ = mainspringEnergyJ(barrelAngleRad, params) - mainspringEnergyJ(barrel1, params);
  return (params.trainEfficiency * releasedJ) / turnedRad;
}

/**
 * Where the capacitor settles with the IC running and the coil charging it
 * for the unshorted (1 − duty) of the time, V, or null if it cannot hold the
 * IC's power at all. From (1 − d)·(e − V_d − V)/R = P/V: the upper root,
 * which is the stable one.
 */
export function steadyCapVoltageV(omegaRadS: number, duty: number, params: SimParams): number | null {
  if (duty >= 1) return null;
  const a = emfV(omegaRadS, params) - params.rectifierDropV;
  const rp = (params.coilResistanceOhm * params.icPowerW) / (1 - duty);
  const disc = a * a - 4 * rp;
  if (a <= 0 || disc < 0) return null;
  return (a + Math.sqrt(disc)) / 2;
}

/**
 * The slowest speed at which the running IC stays above brownout with no
 * brake, rad/s. Below it the capacitor settles under the brownout voltage.
 */
export function icSustainOmegaRadS(params: SimParams): number {
  const vb = params.icBrownoutV;
  const rp = params.coilResistanceOhm * params.icPowerW;
  // Brownout is on the upper root of the capacitor's balance when V_b² ≥ RP;
  // otherwise the IC fails first where the two roots meet, at V = √(RP).
  const aMin = vb * vb >= rp ? vb + rp / vb : 2 * Math.sqrt(rp);
  return (aMin + params.rectifierDropV) / params.generatorKeVSRad;
}

/**
 * The running speed where the drive balances `loadNm(ω)`, searching from
 * `omegaLowRadS` up, rad/s, or null if the drive cannot beat the load there.
 * Every load includes friction, which is at least τ_c + b·ω, so the speed is
 * at most (drive − τ_c)/b: that brackets the search from above.
 */
function balanceOmegaRadS(
  driveNm: number,
  omegaLowRadS: number,
  loadNm: (omegaRadS: number) => number,
  params: SimParams,
): number | null {
  const hi0 = (driveNm - params.frictionCoulombNm) / params.frictionViscousNmSRad;
  if (!(hi0 > omegaLowRadS) || driveNm <= loadNm(omegaLowRadS)) return null;
  let lo = omegaLowRadS;
  let hi = hi0;
  for (let i = 0; i < MAX_BISECTIONS; i++) {
    const mid = (lo + hi) / 2;
    if (mid <= lo || mid >= hi) break;
    if (driveNm > loadNm(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The regulated operating point at the reference speed: the brake duty and
 * capacitor voltage that together absorb the spring's excess torque and keep
 * the IC fed, or null if no duty in [0, 1) does both. Solving the torque
 * balance for duty and substituting into the capacitor's balance gives a
 * quadratic in V: c·V² − (c·a − g)·V + (R·P − g·a) = 0, with B the full
 * brake torque, c = 1 − excess/B, and g = k_e·P/B (PHYSICS.md, D7).
 */
export function regulatedPoint(
  driveNm: number,
  params: SimParams,
): { duty: number; capVoltageV: number; chargeA: number } | null {
  const omega = referenceOmegaRadS(params);
  const ke = params.generatorKeVSRad;
  const fullBrakeNm = (ke * ke * omega) / params.coilResistanceOhm;
  const excessNm = driveNm - frictionTorqueNm(omega, params);
  const c = 1 - excessNm / fullBrakeNm;
  if (c <= 0) return null;
  const g = (ke * params.icPowerW) / fullBrakeNm;
  const a = emfV(omega, params) - params.rectifierDropV;
  const rp = params.coilResistanceOhm * params.icPowerW;
  const b = c * a - g;
  const disc = b * b - 4 * c * (rp - g * a);
  if (disc < 0) return null;
  const capVoltageV = (b + Math.sqrt(disc)) / (2 * c);
  if (capVoltageV < params.icBrownoutV) return null;
  const chargeA = params.icPowerW / capVoltageV;
  const duty = (excessNm - ke * chargeA) / fullBrakeNm;
  if (duty < 0 || duty >= 1) return null;
  return { duty, capVoltageV, chargeA };
}

interface PointInput {
  rotorOmegaRadS: number;
  capVoltageV: number;
  icOn: boolean;
  phaseErrorRad: number;
}

const NO_FLOW = { coilW: 0, rectifierW: 0, icW: 0 };

/** Time for the IC's constant power to take the capacitor from V to brownout, s. */
function capHoldUpS(capVoltageV: number, params: SimParams): number {
  return (capEnergyJ(capVoltageV, params) - capEnergyJ(params.icBrownoutV, params)) / params.icPowerW;
}

/** The IC is running. Returns null if it cannot keep running (a brownout now). */
function icOnPoint(
  s: PointInput,
  driveNm: number,
  params: SimParams,
  controls: SimControls,
  running: boolean,
): OperatingPoint | null {
  const omegaRef = referenceOmegaRadS(params);
  const ke = params.generatorKeVSRad;
  const R = params.coilResistanceOhm;
  const P = params.icPowerW;
  const phase = s.phaseErrorRad;
  if (s.capVoltageV < params.icBrownoutV) return null;

  // Stalled, or ahead of the reference with the brake fully on. Either way
  // nothing charges the capacitor, so the IC lives on it until the wheel
  // falls back to the reference or the capacitor browns out.
  const stuck = !running && driveNm <= breakawayTorqueNm(params);
  if (stuck || (controls.brakeEnabled && phase > 0)) {
    const braked = stuck
      ? null
      : balanceOmegaRadS(
          driveNm,
          frictionMinimumOmegaRadS(params),
          (w) => frictionTorqueNm(w, params) + (ke * ke * w) / R,
          params,
        );
    // A drive too weak to turn the wheel against the full brake stops it.
    const stalled = braked === null;
    const omega = braked ?? 0;
    const holdUpS = capHoldUpS(s.capVoltageV, params);
    const fallBackS = !stalled && omega < omegaRef ? phase / (omegaRef - omega) : Infinity;
    const e = emfV(omega, params);
    return {
      regime: stalled ? 'stalled' : 'holding-back',
      omegaRadS: omega,
      icOn: true,
      duty: stalled ? 0 : 1,
      capVoltageV: s.capVoltageV,
      phaseErrorRad: phase,
      capDraining: true,
      untilS: Math.min(holdUpS, fallBackS),
      event: fallBackS < holdUpS ? 'phase-zero' : 'brownout',
      coilW: stalled ? 0 : (e * e) / R,
      rectifierW: 0,
      icW: P,
    };
  }

  if (controls.brakeEnabled && phase === 0) {
    const reg = regulatedPoint(driveNm, params);
    if (reg) {
      const e = emfV(omegaRef, params);
      return {
        regime: 'regulated',
        omegaRadS: omegaRef,
        icOn: true,
        duty: reg.duty,
        capVoltageV: reg.capVoltageV,
        phaseErrorRad: 0,
        capDraining: false,
        untilS: Infinity,
        event: 'none',
        coilW: (R * reg.chargeA * reg.chargeA) / (1 - reg.duty) + (reg.duty * e * e) / R,
        rectifierW: params.rectifierDropV * reg.chargeA,
        icW: P,
      };
    }
  }

  // No braking: the brake is disabled, the wheel is behind, or the spring
  // cannot reach the target. The coil only charges the capacitor.
  const omegaLow = Math.max(icSustainOmegaRadS(params), frictionMinimumOmegaRadS(params));
  const omega = balanceOmegaRadS(
    driveNm,
    omegaLow,
    (w) => frictionTorqueNm(w, params) + (ke * P) / (steadyCapVoltageV(w, 0, params) ?? Infinity),
    params,
  );
  if (omega === null) return null;
  const capVoltageV = steadyCapVoltageV(omega, 0, params);
  if (capVoltageV === null || capVoltageV < params.icBrownoutV) return null;
  const chargeA = P / capVoltageV;
  const catchingUp = controls.brakeEnabled && phase < 0 && omega > omegaRef;
  const untilS = catchingUp ? -phase / (omega - omegaRef) : Infinity;
  return {
    regime: catchingUp ? 'catching-up' : 'free',
    omegaRadS: omega,
    icOn: true,
    duty: 0,
    capVoltageV,
    phaseErrorRad: phase,
    capDraining: false,
    untilS,
    event: catchingUp ? 'phase-zero' : 'none',
    coilW: R * chargeA * chargeA,
    rectifierW: params.rectifierDropV * chargeA,
    icW: P,
  };
}

/**
 * What the movement does from state `s` with the given drive torque at the
 * glide wheel. Pure; `advanceAveraged` applies it.
 */
export function operatingPoint(
  s: PointInput,
  driveNm: number,
  params: SimParams,
  controls: SimControls,
): OperatingPoint {
  const running = s.rotorOmegaRadS > 0;
  if (s.icOn) {
    const on = icOnPoint(s, driveNm, params, controls, running);
    if (on) return on;
  }

  // The IC is off. With no load on it, the capacitor charges to the EMF less
  // the rectifier's drop and then holds, since only the IC could drain it.
  const stalled = !running && driveNm <= breakawayTorqueNm(params);
  const omega = stalled
    ? null
    : balanceOmegaRadS(driveNm, frictionMinimumOmegaRadS(params), (w) => frictionTorqueNm(w, params), params);
  const capVoltageV =
    omega === null ? s.capVoltageV : Math.max(s.capVoltageV, emfV(omega, params) - params.rectifierDropV);

  if (omega !== null && capVoltageV >= params.icStartV) {
    // Power-on: the counters start from zero, so the reference begins
    // wherever the glide wheel is (decision 19).
    const on = icOnPoint({ ...s, capVoltageV, icOn: true, phaseErrorRad: 0 }, driveNm, params, controls, true);
    if (on) return on;
  }
  return {
    regime: omega === null ? 'stalled' : 'free',
    omegaRadS: omega ?? 0,
    icOn: false,
    duty: 0,
    capVoltageV,
    phaseErrorRad: 0,
    capDraining: false,
    untilS: Infinity,
    event: 'none',
    ...NO_FLOW,
  };
}

export interface AveragedInitialConditions {
  /** Fraction of full wind, 0 to 1. Default: fully wound. */
  windFraction?: number;
  /** Default: discharged. */
  capVoltageV?: number;
}

function emptyLedger(): EnergyLedger {
  return { springJ: 0, trainLossJ: 0, frictionJ: 0, coilJ: 0, rectifierJ: 0, icJ: 0, shockJ: 0 };
}

function cloneState(state: AveragedState): AveragedState {
  return { ...state, energy: { ...state.energy } };
}

/**
 * A movement just let go at this wind, already settled into whatever it does
 * there. Averaged mode has no spin-up or lock transient: from a strong enough
 * spring it starts regulated. To start from a moment in a detailed run
 * instead, use `averagedFromDetailed`.
 */
export function createAveragedState(params: SimParams, initial: AveragedInitialConditions = {}): AveragedState {
  validateParams(params);
  const base: AveragedState = {
    timeS: 0,
    rotorAngleRad: 0,
    rotorOmegaRadS: 0,
    barrelAngleRad: (initial.windFraction ?? 1) * fullWindAngleRad(params),
    capVoltageV: initial.capVoltageV ?? 0,
    icOn: false,
    duty: 0,
    phaseErrorRad: 0,
    regime: 'stalled',
    energy: emptyLedger(),
  };
  return settle(base, params, { brakeEnabled: true });
}

/**
 * Settle a state into its operating point without advancing time: speed,
 * capacitor, IC, and duty take the values the regime gives them. Used on
 * creation, and when the controls change.
 */
export function settle(state: AveragedState, params: SimParams, controls: SimControls): AveragedState {
  const op = operatingPoint(state, driveTorqueNm(state.barrelAngleRad, params), params, controls);
  const s = cloneState(state);
  s.rotorOmegaRadS = op.omegaRadS;
  s.capVoltageV = op.capVoltageV;
  s.icOn = op.icOn;
  s.duty = op.duty;
  s.phaseErrorRad = op.phaseErrorRad;
  s.regime = op.regime;
  return s;
}

/**
 * Carry on from a moment in a detailed run: same time, angles, speed,
 * capacitor, IC, phase error, and ledger. The next averaged step settles it.
 * This is how test 7 compares the two modes over a shared window.
 */
export function averagedFromDetailed(state: SimState, params: SimParams): AveragedState {
  const reg = state.regulator;
  return {
    timeS: state.timeS,
    rotorAngleRad: state.rotorAngleRad,
    rotorOmegaRadS: state.rotorOmegaRadS,
    barrelAngleRad: state.barrelAngleRad,
    capVoltageV: state.capVoltageV,
    icOn: reg.icOn,
    duty: reg.icOn ? reg.duty : 0,
    phaseErrorRad: phaseErrorRad(state, params),
    regime: 'free',
    energy: { ...state.energy },
  };
}

/** Apply an operating point for `dtS`, in place. */
function applyPoint(s: AveragedState, op: OperatingPoint, dtS: number, params: SimParams): void {
  const turnedRad = op.omegaRadS * dtS;
  const barrel1 = Math.max(0, s.barrelAngleRad - turnedRad / params.gearRatio);
  const releasedJ = mainspringEnergyJ(s.barrelAngleRad, params) - mainspringEnergyJ(barrel1, params);
  const e = s.energy;
  e.springJ += releasedJ;
  e.trainLossJ += (1 - params.trainEfficiency) * releasedJ;
  if (op.omegaRadS > 0) e.frictionJ += frictionTorqueNm(op.omegaRadS, params) * turnedRad;
  e.coilJ += op.coilW * dtS;
  e.rectifierJ += op.rectifierW * dtS;
  e.icJ += op.icW * dtS;

  s.barrelAngleRad = barrel1;
  s.rotorAngleRad += turnedRad;
  s.rotorOmegaRadS = op.omegaRadS;
  s.icOn = op.icOn;
  s.duty = op.duty;
  s.regime = op.regime;
  s.phaseErrorRad = op.icOn ? op.phaseErrorRad + (op.omegaRadS - referenceOmegaRadS(params)) * dtS : 0;
  if (op.capDraining) {
    // The IC's constant power comes straight out of the capacitor's energy.
    const energyJ = Math.max(capEnergyJ(params.icBrownoutV, params), capEnergyJ(op.capVoltageV, params) - op.icW * dtS);
    s.capVoltageV = Math.sqrt((2 * energyJ) / params.capacitanceF);
  } else {
    s.capVoltageV = op.capVoltageV;
  }
  s.timeS += dtS;

  if (dtS === op.untilS) {
    if (op.event === 'phase-zero') s.phaseErrorRad = 0;
    if (op.event === 'brownout') {
      s.capVoltageV = params.icBrownoutV;
      s.icOn = false;
      s.duty = 0;
      s.phaseErrorRad = 0;
    }
  }
}

/** One step of at most `maxDtS`, in place. Returns the time it took, s. */
function stepInPlace(s: AveragedState, maxDtS: number, params: SimParams, controls: SimControls): number {
  // Predictor: the operating point at the start-of-step drive. Corrector: the
  // same at the mean drive over the angle the predictor turns through.
  const op0 = operatingPoint(s, driveTorqueNm(s.barrelAngleRad, params), params, controls);
  const dt0 = Math.min(maxDtS, op0.untilS);
  const op = operatingPoint(s, meanDriveTorqueNm(s.barrelAngleRad, op0.omegaRadS * dt0, params), params, controls);
  const dtS = Math.min(maxDtS, op.untilS);
  applyPoint(s, op, dtS, params);
  return dtS;
}

/**
 * Advance by `durationS` of sim time. Returns a new state; the input is
 * untouched. Time lands exactly on `state.timeS + durationS`.
 */
export function advanceAveraged(
  state: AveragedState,
  params: SimParams,
  controls: SimControls,
  durationS: number,
): AveragedState {
  const s = cloneState(state);
  const endS = state.timeS + Math.max(0, durationS);
  let remainingS = Math.max(0, durationS);
  while (remainingS > 0) {
    const chunkS = Math.min(params.averagedStepS, remainingS);
    let leftS = chunkS;
    for (let events = 0; leftS > 0; events++) {
      if (events >= MAX_EVENTS_PER_STEP) throw new Error(`Averaged mode cycled regimes at t = ${s.timeS} s`);
      leftS -= stepInPlace(s, leftS, params, controls);
    }
    remainingS -= chunkS;
  }
  s.timeS = endS;
  return s;
}

export function sampleOfAveraged(state: AveragedState): Sample {
  return {
    timeS: state.timeS,
    rotorAngleRad: state.rotorAngleRad,
    rotorOmegaRadS: state.rotorOmegaRadS,
    barrelAngleRad: state.barrelAngleRad,
    capVoltageV: state.capVoltageV,
    icOn: state.icOn,
    duty: state.icOn ? state.duty : 0,
    phaseErrorRad: state.icOn ? state.phaseErrorRad : 0,
  };
}

/**
 * Run an averaged scenario. Samples are taken at t = 0 and every sample
 * interval, rounded to whole averaged steps. Also returns each sample's
 * regime, which the Sample shape shared with detailed mode has no room for.
 */
export function runAveragedScenario(scenario: AveragedScenario): {
  samples: Sample[];
  regimes: AveragedRegime[];
  final: AveragedState;
} {
  const { params, controls } = scenario;
  validateParams(params);
  const stepS = params.averagedStepS;
  const totalSteps = Math.round(scenario.durationS / stepS);
  const sampleEvery = Math.max(1, Math.round(scenario.sampleIntervalS / stepS));
  let s = cloneState(scenario.initial);
  const t0 = s.timeS;
  const samples: Sample[] = [sampleOfAveraged(s)];
  const regimes: AveragedRegime[] = [s.regime];
  for (let i = 1; i <= totalSteps; i++) {
    s = advanceAveraged(s, params, controls, stepS);
    // Whole steps from the start, so sample times never accumulate rounding.
    s.timeS = t0 + i * stepS;
    if (i % sampleEvery === 0) {
      samples.push(sampleOfAveraged(s));
      regimes.push(s.regime);
    }
  }
  return { samples, regimes, final: s };
}
