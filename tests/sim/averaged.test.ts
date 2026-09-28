import { describe, expect, it } from 'vitest';
import {
  advanceAveraged,
  averagedFromDetailed,
  createAveragedState,
  driveTorqueNm,
  icSustainOmegaRadS,
  meanDriveTorqueNm,
  operatingPoint,
  referenceOmegaRadS,
  regulatedPoint,
  runAveragedScenario,
  sampleOfAveraged,
  settle,
  steadyCapVoltageV,
} from '../../src/sim/averaged.ts';
import { advanceDetailed, advanceSteps, createState, phaseErrorRad } from '../../src/sim/detailed.ts';
import { coilCurrents, generatorTorqueNm, maxBrakeTorqueNm } from '../../src/sim/generator.ts';
import { fullWindAngleRad, mainspringEnergyJ, windBarrel } from '../../src/sim/mainspring.ts';
import { capEnergyJ } from '../../src/sim/power.ts';
import { frictionTorqueNm } from '../../src/sim/rotor.ts';
import type { AveragedRegime, AveragedState } from '../../src/sim/types.ts';
import { SECONDS_PER_HOUR, TAU } from '../../src/sim/units.ts';
import { P, REFERENCE_PERIOD_S, revS } from './helpers.ts';

// Averaged mode, piece by piece: its operating points against the figures
// PHYSICS.md derives, each regime and the events that end it, and the
// awkward cases (a run-down spring, a huge step, a zero step, winding after
// the watch has stopped). Tests 3, 4, and 7 are in rate, rundown, and
// agreement.test.ts.

const BRAKE = { brakeEnabled: true };
const NO_BRAKE = { brakeEnabled: false };
const W0 = referenceOmegaRadS(P);

/** Advance in steps of `stepS`, recording the regime and time after each. */
function trace(state: AveragedState, controls: typeof BRAKE, durationS: number, stepS: number) {
  const out: { timeS: number; regime: AveragedRegime; state: AveragedState }[] = [];
  let s = state;
  for (let t = 0; t < durationS; t += stepS) {
    s = advanceAveraged(s, P, controls, stepS);
    out.push({ timeS: s.timeS, regime: s.regime, state: s });
  }
  return out;
}

describe('averaged operating points', () => {
  it.each([
    [1, 0.112],
    [0.5, 0.0713],
    [0.03, 0.0306],
  ])('settles at %s of full wind into regulation, at the steady duty PHYSICS.md derives, %s', (wind, duty) => {
    const s = createAveragedState(P, { windFraction: wind });
    expect(s.regime).toBe('regulated');
    expect(s.rotorOmegaRadS).toBe(W0);
    expect(s.icOn).toBe(true);
    // 0.5%: PHYSICS.md rounds the duty to three significant figures, which is
    // at most 0.45% of it (0.0306 for 0.030567).
    expect(Math.abs(s.duty / duty - 1)).toBeLessThan(0.005);
  });

  it('holds the capacitor at the 1.3400 V PHYSICS.md derives, with the full-wind duty, in D5', () => {
    // 0.1 mV: the rounding PHYSICS.md shows. (At half wind the duty is lower,
    // the capacitor charges for longer, and it sits 0.9 mV higher.)
    expect(Math.abs(createAveragedState(P, { windFraction: 1 }).capVoltageV - 1.34)).toBeLessThan(1e-4);
  });

  it('solves the regulated point so that both the torques and the capacitor currents balance', () => {
    // Checked with the generator's own formulas, which generator.test.ts
    // checks against the drawn waveform, not with the solver's.
    for (const wind of [1, 0.7, 0.03]) {
      const driveNm = driveTorqueNm(wind * fullWindAngleRad(P), P);
      const reg = regulatedPoint(driveNm, P)!;
      const c = coilCurrents(W0, reg.capVoltageV, reg.duty, P);
      const torqueNm = frictionTorqueNm(W0, P) + generatorTorqueNm(c, W0, P);
      // 10⁻¹²: the solver closes its bracket to adjacent doubles, so only
      // float rounding remains.
      expect(Math.abs(torqueNm / driveNm - 1)).toBeLessThan(1e-12);
      expect(Math.abs(c.chargeA / (P.icPowerW / reg.capVoltageV) - 1)).toBeLessThan(1e-12);
      expect(reg.chargeA).toBe(P.icPowerW / reg.capVoltageV);
    }
  });

  it('has no regulated point when the spring cannot reach 8 rev/s, or when it could overpower the full brake', () => {
    expect(regulatedPoint(frictionTorqueNm(W0, P), P)).toBeNull();
    expect(regulatedPoint(frictionTorqueNm(W0, P) + 1.1 * maxBrakeTorqueNm(W0, P), P)).toBeNull();
  });

  it('puts the capacitor on the upper, stable root of its balance', () => {
    const v = steadyCapVoltageV(W0, 0, P)!;
    const heldW = (volts: number) => coilCurrents(W0, volts, 0, P).chargeA * volts;
    // 10⁻¹²: solved to adjacent doubles.
    expect(Math.abs(heldW(v) / P.icPowerW - 1)).toBeLessThan(1e-12);
    // Stable: a little higher and the coil gives less than the IC takes, so
    // the capacitor falls back; a little lower, and it gives more.
    expect(heldW(v + 1e-3)).toBeLessThan(P.icPowerW);
    expect(heldW(v - 1e-3)).toBeGreaterThan(P.icPowerW);
    // D5: 1.3424 V at 8 rev/s with the brake off, 29 mV under the peak less
    // the drop. 0.1 mV: the digits PHYSICS.md shows.
    expect(Math.abs(v - 1.3424)).toBeLessThan(1e-4);
  });

  it('finds no capacitor balance when the EMF is too low for the IC, or the coil is shorted all the time', () => {
    expect(steadyCapVoltageV(1, 0, P)).toBeNull();
    expect(steadyCapVoltageV(W0, 1, P)).toBeNull();
    // Just below the slowest speed that sustains the IC, the upper root is
    // under brownout; at it, the root is brownout.
    const sustain = icSustainOmegaRadS(P);
    expect(steadyCapVoltageV(sustain * 0.999, 0, P) ?? 0).toBeLessThan(P.icBrownoutV);
    expect(Math.abs(steadyCapVoltageV(sustain, 0, P)! - P.icBrownoutV)).toBeLessThan(1e-9);
  });

  it('holds the IC down to 4.275 rev/s with the brake off, where the capacitor settles at 0.6 V (D5)', () => {
    // 0.0005 rev/s: half a unit in the last digit PHYSICS.md shows.
    expect(Math.abs(revS(icSustainOmegaRadS(P)) - 4.275)).toBeLessThan(5e-4);
  });

  it('runs away at the 30.61 rev/s of test 1 with the brake disabled at full wind', () => {
    const s = settle(createAveragedState(P), P, NO_BRAKE);
    expect(s.regime).toBe('free');
    expect(s.icOn).toBe(true);
    // 2 × 10⁻⁴: PHYSICS.md shows 30.61, which is ±1.6 × 10⁻⁴ of it.
    expect(Math.abs(revS(s.rotorOmegaRadS) / 30.61 - 1)).toBeLessThan(2e-4);
  });

  it('books the mean drive over a step as the exact energy released per radian', () => {
    const barrelRad = 0.5 * fullWindAngleRad(P);
    const turnedRad = 1000;
    const releasedJ = mainspringEnergyJ(barrelRad, P) - mainspringEnergyJ(barrelRad - turnedRad / P.gearRatio, P);
    expect(meanDriveTorqueNm(barrelRad, turnedRad, P) * turnedRad).toBeCloseTo(P.trainEfficiency * releasedJ, 15);
    expect(meanDriveTorqueNm(barrelRad, 0, P)).toBe(driveTorqueNm(barrelRad, P));
  });
});

describe('averaged regimes and their events', () => {
  it('catches up a wheel a turn behind: brake off, faster than 8 rev/s, then regulated exactly on the reference', () => {
    const behind = { ...createAveragedState(P, { windFraction: 0.5 }), phaseErrorRad: -TAU };
    const op = operatingPoint(behind, driveTorqueNm(behind.barrelAngleRad, P), P, BRAKE);
    expect(op.regime).toBe('catching-up');
    expect(op.duty).toBe(0);
    expect(op.omegaRadS).toBeGreaterThan(W0);
    // A turn at the difference in speed.
    expect(op.untilS).toBeCloseTo(TAU / (op.omegaRadS - W0), 12);

    const after = advanceAveraged(behind, P, BRAKE, 1);
    expect(after.regime).toBe('regulated');
    expect(after.phaseErrorRad).toBe(0);
    // It turned one second at 8 rev/s plus the turn it owed. 10⁻⁹ rad: float rounding.
    expect(Math.abs(after.rotorAngleRad - behind.rotorAngleRad - (W0 + TAU))).toBeLessThan(1e-9);
  });

  describe('holding back a wheel far ahead: the brake re-enabled after 30 s of runaway, without realigning', () => {
    // 30 s: the wheel is 642 turns ahead, which takes the held-back wheel
    // longer to give back (about 97 s) than the capacitor, charged to 5.8 V by
    // the runaway, can carry the IC (about 66 s). So it browns out first.
    const d30 = advanceDetailed(createState(P), P, NO_BRAKE, 30).state;
    const start = averagedFromDetailed(d30, P);
    const steps = trace(start, BRAKE, 80, 0.01);
    const holding = steps.filter((x) => x.regime === 'holding-back');
    const endS = holding.at(-1)!.timeS;

    it('brakes fully, down to the 1.193 rev/s where drive meets friction plus the shorted coil', () => {
      const s = holding[100]!.state;
      expect(s.duty).toBe(1);
      const ke = P.generatorKeVSRad;
      const loadNm =
        frictionTorqueNm(s.rotorOmegaRadS, P) + ((Math.PI ** 2 / 8) * ke * ke * s.rotorOmegaRadS) / P.coilResistanceOhm;
      // 10⁻⁶: the point balances the mean drive over its step, and this is
      // the drive at the step's end; on the curve's steep top they differ by 5 × 10⁻⁸.
      expect(Math.abs(loadNm / driveTorqueNm(s.barrelAngleRad, P) - 1)).toBeLessThan(1e-6);
      // At exactly full wind it is 1.195 rev/s (PHYSICS.md, Model
      // predictions): (3.241 × 10⁻⁸ − 1.5 × 10⁻⁹) ÷ (1.6 × 10⁻¹⁰ + 3.958 × 10⁻⁹)
      // = 7.506 rad/s. The 30 s runaway spent 4.3 × 10⁻⁴ of the wind, which on
      // the curve's steep top lowers the drive by 0.13%, and the speed with
      // it: 1.1929 rev/s here, measured.
      expect(Math.abs(revS(s.rotorOmegaRadS) - 1.193)).toBeLessThan(5e-4);
      const fullWind = { ...createAveragedState(P), phaseErrorRad: 1 };
      const held = operatingPoint(fullWind, driveTorqueNm(fullWind.barrelAngleRad, P), P, BRAKE);
      expect(held.regime).toBe('holding-back');
      expect(Math.abs(revS(held.omegaRadS) - 1.195)).toBeLessThan(5e-4);
    });

    it('runs the IC from the capacitor until it browns out, when the energy above 0.6 V is spent', () => {
      const holdUpS = (capEnergyJ(d30.capVoltageV, P) - capEnergyJ(P.icBrownoutV, P)) / P.icPowerW;
      // One 0.01 s trace step: the brownout falls somewhere inside it.
      expect(Math.abs(endS - (30 + holdUpS))).toBeLessThanOrEqual(0.01);
    });

    it('browns out within one reference period of detailed mode, whose regulator only brakes at its next tick', () => {
      let x = d30;
      // Bounded, so a model that never browns out fails rather than hangs.
      while (x.regulator.icOn && x.timeS < endS + 5) x = advanceSteps(x, P, BRAKE, 64);
      expect(x.regulator.icOn).toBe(false);
      const lagS = x.timeS - endS;
      expect(lagS).toBeGreaterThan(0);
      expect(lagS).toBeLessThanOrEqual(REFERENCE_PERIOD_S + 0.02);
    });

    it('then restarts the IC, which realigns the reference, and regulates', () => {
      const next = steps.find((x) => x.timeS > endS + 0.005)!;
      expect(next.regime).toBe('regulated');
      expect(next.state.phaseErrorRad).toBe(0);
      expect(steps.at(-1)!.regime).toBe('regulated');
    });
  });

  describe('holding back after only 10 s of runaway: the wheel falls back onto the reference before the capacitor runs out', () => {
    // 190 turns ahead, given back at 8 − 1.195 rev/s, takes about 28 s. The
    // capacitor, charged to 5.79 V by the runaway, carries the IC for about
    // 66 s (½C(V² − V_b²)/P), so the hold-back ends on the reference, not in
    // a brownout. Before M7b the capacitor reached only 3.6 V, and the same
    // 10 s runaway browned out.
    const d10 = advanceDetailed(createState(P), P, NO_BRAKE, 10).state;
    const steps = trace(averagedFromDetailed(d10, P), BRAKE, 30, 0.01);
    const holding = steps.filter((x) => x.regime === 'holding-back');

    it('holds back, then regulates, with the IC on throughout', () => {
      expect(holding.length).toBeGreaterThan(0);
      expect(steps.every((x) => x.state.icOn)).toBe(true);
      const after = steps.find((x) => x.timeS > holding.at(-1)!.timeS)!;
      expect(after.regime).toBe('regulated');
      expect(after.state.phaseErrorRad).toBe(0);
    });

    it('ends the hold-back when the turns gained are given back, at the gap between the speeds', () => {
      const gapRadS = W0 - holding[0]!.state.rotorOmegaRadS;
      const expectedS = averagedFromDetailed(d10, P).phaseErrorRad / gapRadS;
      // 0.05 s: the held-back speed falls very slightly as the spring unwinds
      // (a part in 10⁵ over 28 s), and the trace step is 0.01 s.
      expect(Math.abs(holding.at(-1)!.timeS - 10 - expectedS)).toBeLessThan(0.05);
    });

    it('never browns out in detailed mode either', () => {
      let x = d10;
      for (let t = 0; t < 30; t += 1) {
        x = advanceDetailed(x, P, BRAKE, 1).state;
        expect(x.regulator.icOn).toBe(true);
      }
    });
  });

  it('lets the phase error grow with the brake disabled, at the gap between wheel and reference', () => {
    const s0 = settle(createAveragedState(P), P, NO_BRAKE);
    const s1 = advanceAveraged(s0, P, NO_BRAKE, 2);
    expect(s1.regime).toBe('free');
    expect(Math.abs(s1.phaseErrorRad - 2 * (s0.rotorOmegaRadS - W0)) / s1.phaseErrorRad).toBeLessThan(1e-4);
  });

  it('keeps a stalled IC running from the capacitor for the 2.88 s hold-up PHYSICS.md derives, then browns out', () => {
    const stalled: AveragedState = {
      ...createAveragedState(P, { windFraction: 0.5 }),
      barrelAngleRad: 0,
      rotorOmegaRadS: 0,
    };
    const steps = trace(stalled, BRAKE, 3, 0.01);
    expect(steps[0]!.regime).toBe('stalled');
    expect(steps[0]!.state.icOn).toBe(true);
    const off = steps.find((x) => !x.state.icOn)!;
    // PHYSICS.md, D5: 2.88 s from the operating voltage at half wind. The IC
    // draws constant power, so the model's figure is exact: ½C(V² − V_b²)/P.
    // One trace step of slack either side.
    const holdUpS = (capEnergyJ(stalled.capVoltageV, P) - capEnergyJ(P.icBrownoutV, P)) / P.icPowerW;
    expect(Math.abs(holdUpS - 2.88)).toBeLessThan(0.005);
    expect(Math.abs(off.timeS - holdUpS)).toBeLessThanOrEqual(0.01);
    expect(off.state.rotorOmegaRadS).toBe(0);
  });
});

describe('averaged mode, awkward cases', () => {
  it('never moves a fully run-down spring, and never starts the IC', () => {
    const s0 = createAveragedState(P, { windFraction: 0 });
    const s1 = advanceAveraged(s0, P, BRAKE, SECONDS_PER_HOUR);
    expect(s1.regime).toBe('stalled');
    expect(s1.rotorAngleRad).toBe(0);
    expect(s1.icOn).toBe(false);
    expect(s1.energy.springJ).toBe(0);
  });

  it('keeps a turning wheel turning, and a stopped one stopped, on a drive between running and breakaway friction', () => {
    // Fraction 0.005: 2.7 × 10⁻⁹ N·m at the wheel, above the 2.02 × 10⁻⁹
    // friction minimum but below the 3.0 × 10⁻⁹ breakaway (D3, D5).
    const stopped = createAveragedState(P, { windFraction: 0.005 });
    expect(stopped.regime).toBe('stalled');
    const turning = settle({ ...stopped, rotorOmegaRadS: 1 }, P, BRAKE);
    expect(turning.regime).toBe('free');
    expect(turning.rotorOmegaRadS).toBeGreaterThan(0);
  });

  it('comes back to life when wound after stopping: the IC starts, realigns, and regulates', () => {
    const dead = runAveragedScenario({
      params: P,
      initial: createAveragedState(P, { windFraction: 0.004 }),
      controls: BRAKE,
      durationS: 2 * SECONDS_PER_HOUR,
      sampleIntervalS: SECONDS_PER_HOUR,
    }).final;
    expect(dead.regime).toBe('stalled');
    const wound = { ...dead, barrelAngleRad: windBarrel(dead.barrelAngleRad, fullWindAngleRad(P), P) };
    const alive = advanceAveraged(wound, P, BRAKE, 1);
    expect(alive.regime).toBe('regulated');
    expect(alive.icOn).toBe(true);
    expect(alive.phaseErrorRad).toBe(0);
  });

  it('gives the same physics for one 10 h step as for 36,000 one-second steps, as after a tab returns from the background', () => {
    const s0 = createAveragedState(P, { windFraction: 0.2 });
    const once = advanceAveraged(s0, P, BRAKE, 10 * SECONDS_PER_HOUR);
    let many = s0;
    for (let i = 0; i < 36_000; i++) many = advanceAveraged(many, P, BRAKE, 1);
    const { timeS: t1, ...a } = once;
    const { timeS: t2, ...b } = many;
    expect(a).toStrictEqual(b);
    expect(t1).toBe(36_000);
    // Summing 36,000 ones is exact in binary.
    expect(t2).toBe(36_000);
  });

  it('returns an equal state for a zero or negative step, and never mutates its input', () => {
    const s0 = createAveragedState(P, { windFraction: 0.5 });
    const copy = structuredClone(s0);
    expect(advanceAveraged(s0, P, BRAKE, 0)).toStrictEqual(s0);
    expect(advanceAveraged(s0, P, BRAKE, -5)).toStrictEqual(s0);
    advanceAveraged(s0, P, BRAKE, 100);
    expect(s0).toStrictEqual(copy);
  });

  it('is deterministic: the same scenario gives bit-identical samples and state', () => {
    const scenario = {
      params: P,
      initial: createAveragedState(P, { windFraction: 0.05 }),
      controls: BRAKE,
      durationS: 5 * SECONDS_PER_HOUR,
      sampleIntervalS: 600,
    };
    expect(runAveragedScenario(scenario)).toStrictEqual(runAveragedScenario(scenario));
  });

  it('samples at t = 0 and every interval, on exact whole seconds', () => {
    const { samples } = runAveragedScenario({
      params: P,
      initial: createAveragedState(P),
      controls: BRAKE,
      durationS: 3600,
      sampleIntervalS: 60,
    });
    expect(samples).toHaveLength(61);
    samples.forEach((s, i) => expect(s.timeS).toBe(60 * i));
  });

  it('carries a detailed state over whole: time, angles, speed, capacitor, IC, phase error, and ledger', () => {
    const d = advanceDetailed(createState(P), P, BRAKE, 5).state;
    const a = averagedFromDetailed(d, P);
    expect(a.timeS).toBe(d.timeS);
    expect(a.rotorAngleRad).toBe(d.rotorAngleRad);
    expect(a.rotorOmegaRadS).toBe(d.rotorOmegaRadS);
    expect(a.barrelAngleRad).toBe(d.barrelAngleRad);
    expect(a.capVoltageV).toBe(d.capVoltageV);
    expect(a.icOn).toBe(d.regulator.icOn);
    expect(a.phaseErrorRad).toBe(phaseErrorRad(d, P));
    expect(a.energy).toStrictEqual(d.energy);
    expect(a.energy).not.toBe(d.energy);
  });

  it('reports zero duty and phase error in samples while the IC is off', () => {
    const s = { ...createAveragedState(P), icOn: false, duty: 0.5, phaseErrorRad: 3 };
    expect(sampleOfAveraged(s).duty).toBe(0);
    expect(sampleOfAveraged(s).phaseErrorRad).toBe(0);
  });

  it('rejects parameters detailed mode rejects, such as an IC that starts below its brownout', () => {
    expect(() => createAveragedState({ ...P, icStartV: 0.5 })).toThrow(RangeError);
  });
});
