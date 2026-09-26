// The shapes the simulation passes around. Plain data only: a state is a
// value, and stepping returns a new one, so widgets and tests can keep any
// state they like without it changing underneath them.

/**
 * A mainspring torque curve: points of (fraction of full wind, barrel torque
 * in N·m), with fractions rising from 0 (let down) to 1 (fully wound).
 * Torque between points is linear, so stored energy has a closed form.
 */
export type TorqueCurve = readonly (readonly [fractionWound: number, torqueNm: number])[];

/**
 * Every number the physics reads. `DEFAULT_PARAMS` in params.ts builds this
 * from named constants, each with a PHYSICS.md row. Widgets may pass a
 * modified copy (a coil-load slider, say), but never invent a field.
 */
export interface SimParams {
  /** Glide wheel speed the regulator holds, rad/s. */
  rotorTargetOmegaRadS: number;
  /** Crystal frequency, Hz. */
  quartzHz: number;
  /** Binary divider stages from the crystal to the reference. */
  referenceDividerStages: number;

  /** Barrel turns from fully let down to fully wound. */
  barrelTurnsFull: number;
  /** Glide wheel turns per barrel turn. */
  gearRatio: number;
  /** Fraction of barrel power that reaches the glide wheel. */
  trainEfficiency: number;
  mainspringCurve: TorqueCurve;

  /** Glide wheel inertia, including what the train reflects onto it, kg·m². */
  rotorInertiaKgM2: number;
  /** Speed-independent friction at the glide wheel, N·m. */
  frictionCoulombNm: number;
  /** Speed-proportional friction at the glide wheel, N·m per rad/s. */
  frictionViscousNmSRad: number;
  /** Breakaway friction at rest, N·m. The excess over Coulomb fades with speed. */
  frictionStaticNm: number;
  /** Speed over which breakaway friction fades to Coulomb friction (1/e), rad/s. */
  frictionStribeckRadS: number;

  /** Generator constant: rectified-mean EMF per unit speed, V·s/rad. */
  generatorKeVSRad: number;
  coilResistanceOhm: number;
  /** Voltage lost across the rectifier while it conducts, V. */
  rectifierDropV: number;
  capacitanceF: number;

  /** IC and quartz oscillator consumption while running, W. */
  icPowerW: number;
  /** The IC stops below this supply voltage, V. */
  icBrownoutV: number;
  /** The IC starts, or restarts, at or above this supply voltage, V. */
  icStartV: number;

  /** Brake duty per radian of phase error. */
  regulatorKpPerRad: number;
  /** Brake duty per radian-second of accumulated phase error. */
  regulatorKiPerRadS: number;
  /** Brake duty per rad/s of speed error, measured over the last reference period. */
  regulatorKdPerRadS: number;

  /** Detailed mode's fixed timestep, s. */
  stepS: number;
  /** Averaged mode's longest step, s. */
  averagedStepS: number;
}

/** What a reader, a widget, or a scenario can switch. */
export interface SimControls {
  /**
   * When false the coil is never shorted: the rotor runs against friction
   * and the capacitor's charging current only. The IC still runs, and still
   * measures phase error, if it has power.
   */
  brakeEnabled: boolean;
}

/**
 * Cumulative energy, in joules, since the state was created. Every term is
 * computed from its own physical formula, not as a remainder, so test 5
 * can check that they balance.
 */
export interface EnergyLedger {
  /** Released by the mainspring (negative while it is being wound). */
  springJ: number;
  /** Lost in the gear train between barrel and glide wheel. */
  trainLossJ: number;
  /** Lost to glide wheel friction, Coulomb and viscous. */
  frictionJ: number;
  /** Heat in the coil's resistance, while braking and while charging. */
  coilJ: number;
  /** Heat in the rectifier's forward drop. */
  rectifierJ: number;
  /** Consumed by the IC and quartz oscillator. */
  icJ: number;
  /** Added to the glide wheel by shocks (negative for a shock that slows it). */
  shockJ: number;
}

export interface RegulatorState {
  /** Whether the IC has power. Below brownout it stops, and so does the brake. */
  icOn: boolean;
  /** Crystal cycles counted since the IC last started. */
  quartzCycles: number;
  /** Glide wheel angle the reference was aligned to when the IC started, rad. */
  referenceOriginRad: number;
  /** Phase error accumulated over reference ticks, rad·s. */
  integralRadS: number;
  /** Fraction of time the coil is shorted, held between reference ticks. */
  duty: number;
  /** Phase error measured at the latest reference tick, rad. Positive is ahead. */
  lastPhaseErrorRad: number;
}

export interface SimState {
  /** Whole timesteps taken. Time is derived from it, so it never drifts. */
  step: number;
  timeS: number;
  /** Unwrapped glide wheel angle, rad. Wrap it before drawing. */
  rotorAngleRad: number;
  rotorOmegaRadS: number;
  /** How far the mainspring is wound, as barrel angle from let down, rad. */
  barrelAngleRad: number;
  capVoltageV: number;
  regulator: RegulatorState;
  energy: EnergyLedger;
}

/** A shock to the watch, modelled as an instantaneous change in glide wheel speed. */
export interface Shock {
  timeS: number;
  deltaOmegaRadS: number;
}

/** A complete, reproducible run: the CLI (M2) and the physics tests are built on these. */
export interface Scenario {
  params: SimParams;
  initial: SimState;
  controls: SimControls;
  durationS: number;
  /** Record a sample this often. Rounded to whole timesteps. */
  sampleIntervalS: number;
  shocks: readonly Shock[];
}

/** What a scenario records at each sample. */
export interface Sample {
  timeS: number;
  rotorAngleRad: number;
  rotorOmegaRadS: number;
  barrelAngleRad: number;
  capVoltageV: number;
  icOn: boolean;
  duty: number;
  phaseErrorRad: number;
}

/**
 * What averaged mode says the movement is doing over a step. Each is a
 * quasi-steady state: the glide wheel's speed is wherever its torques
 * balance, and the capacitor is wherever its currents balance.
 *
 * - `regulated`: the IC holds the glide wheel at the reference with a steady
 *   brake duty, and phase error stays at zero.
 * - `catching-up`: behind the reference with a spring strong enough to catch
 *   it, the brake is off until the wheel does.
 * - `holding-back`: ahead of the reference, the brake is fully on, and the IC
 *   runs from the capacitor alone until the wheel falls back or the
 *   capacitor browns out.
 * - `free`: no braking. The brake is disabled, the IC is off, or the spring
 *   is too weak to reach the target.
 * - `stalled`: the drive cannot beat friction, and the wheel is at rest.
 */
export type AveragedRegime = 'regulated' | 'catching-up' | 'holding-back' | 'free' | 'stalled';

/** Averaged mode's state. The same quantities as `SimState`, without the sub-turn detail. */
export interface AveragedState {
  timeS: number;
  /** Unwrapped glide wheel angle, rad. */
  rotorAngleRad: number;
  rotorOmegaRadS: number;
  barrelAngleRad: number;
  capVoltageV: number;
  icOn: boolean;
  /** Mean brake duty over the last step. Zero while the IC is off. */
  duty: number;
  /** How far the glide wheel is ahead of the reference, rad. Zero while the IC is off. */
  phaseErrorRad: number;
  regime: AveragedRegime;
  energy: EnergyLedger;
}

/** A complete, reproducible averaged-mode run. Shocks are too brief for averaged mode, so it takes none. */
export interface AveragedScenario {
  params: SimParams;
  initial: AveragedState;
  controls: SimControls;
  durationS: number;
  /** Record a sample this often. Rounded to whole averaged steps. */
  sampleIntervalS: number;
}
