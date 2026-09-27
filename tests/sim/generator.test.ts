import { describe, expect, it } from 'vitest';
import {
  coilCurrents,
  coilLossesW,
  emfFrequencyHz,
  emfV,
  generatorTorqueNm,
  instantaneousEmfV,
  maxBrakeTorqueNm,
  peakEmfV,
} from '../../src/sim/generator.ts';
import { P } from './helpers.ts';

const W0 = P.rotorTargetOmegaRadS;

describe('the generator', () => {
  it('makes 1.0 V at 8 rev/s, and EMF proportional to speed', () => {
    expect(emfV(W0, P)).toBeCloseTo(1, 12);
    expect(emfV(W0 / 2, P)).toBeCloseTo(0.5, 12);
  });

  it('can brake with 1.989 × 10⁻⁷ N·m when fully shorted at 8 rev/s (D4)', () => {
    expect(maxBrakeTorqueNm(W0, P)).toBeCloseTo(1.989e-7, 10);
    const shorted = coilCurrents(W0, 0.8, 1, P);
    expect(generatorTorqueNm(shorted, P)).toBeCloseTo(maxBrakeTorqueNm(W0, P), 18);
  });

  it("brakes in proportion to duty: τ = d·(π²/8)·k_e²·ω/R, PLAN.md's k_e²·ω/R_eff with R_eff = R/(d·π²/8)", () => {
    // With the capacitor above the EMF, only the brake path conducts.
    for (const d of [0, 0.1, 0.5]) {
      expect(generatorTorqueNm(coilCurrents(W0, 5, d, P), P)).toBeCloseTo(d * maxBrakeTorqueNm(W0, P), 18);
    }
  });

  it('charges only while the EMF exceeds the capacitor voltage plus the rectifier drop', () => {
    expect(coilCurrents(W0, 0.81, 0, P).chargeA).toBe(0);
    expect(coilCurrents(W0, 0.79, 0, P).chargeA).toBeCloseTo(0.01 / P.coilResistanceOhm, 15);
  });

  it('turns every watt it takes from the wheel into coil heat, rectifier heat, or capacitor charge', () => {
    for (const [omega, v, d] of [
      [W0, 0.7, 0.1],
      [W0 * 2, 0.3, 0.6],
      [W0 / 3, 0, 0],
    ] as const) {
      const c = coilCurrents(omega, v, d, P);
      const mechanicalW = generatorTorqueNm(c, P) * omega;
      const { coilW, rectifierW } = coilLossesW(c, d, P);
      expect(coilW + rectifierW + v * c.chargeA).toBeCloseTo(mechanicalW, 18);
    }
  });
});

describe('the EMF waveform (D9)', () => {
  /** Mean of f over one turn of the wheel, by the midpoint rule on n points. */
  function meanOverTurn(f: (angleRad: number) => number, n = 4096): number {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += f(((i + 0.5) * 2 * Math.PI) / n);
    return sum / n;
  }

  it('peaks at 1.5708 V and cycles at 8 Hz at 8 rev/s, with one pole pair', () => {
    expect(peakEmfV(W0, P)).toBeCloseTo(Math.PI / 2, 12);
    expect(emfFrequencyHz(W0, P)).toBeCloseTo(8, 12);
  });

  it('has the rectified mean the dynamics use, k_e·ω, at any speed and pole count', () => {
    for (const polePairs of [1, 2, 3]) {
      const params = { ...P, generatorPolePairs: polePairs };
      for (const omega of [W0 / 4, W0, 3 * W0]) {
        const rectified = meanOverTurn((a) => Math.abs(instantaneousEmfV(a, omega, params)));
        // The midpoint rule on 4,096 points integrates |sin| to about 1 part
        // in 10⁷ (its error goes as the square of the step, and |sin| has a
        // kink at each zero), so 10⁻⁶ of the mean is a comfortable bound.
        expect(Math.abs(rectified / emfV(omega, params) - 1)).toBeLessThan(1e-6);
      }
    }
  });

  it('is alternating: its signed mean over a turn is zero', () => {
    // Summing 4,096 sines of order 1 V leaves float rounding near 10⁻¹³ V.
    expect(Math.abs(meanOverTurn((a) => instantaneousEmfV(a, W0, P)))).toBeLessThan(1e-12);
  });

  it('is zero as a pole faces the coil, and largest a quarter of a pole pitch later', () => {
    expect(instantaneousEmfV(0, W0, P)).toBe(0);
    expect(Math.abs(instantaneousEmfV(Math.PI, W0, P))).toBeLessThan(1e-15);
    expect(instantaneousEmfV(Math.PI / 2, W0, P)).toBeCloseTo(peakEmfV(W0, P), 12);
    const twoPairs = { ...P, generatorPolePairs: 2 };
    expect(instantaneousEmfV(Math.PI / 4, W0, twoPairs)).toBeCloseTo(peakEmfV(W0, twoPairs), 12);
  });

  it('is −dλ/dt for a flux linkage that depends only on angle: the EMF at a point scales with speed', () => {
    // Same angle, twice the speed: twice the EMF. Reversed: the sign flips.
    const a = 0.7;
    expect(instantaneousEmfV(a, 2 * W0, P)).toBeCloseTo(2 * instantaneousEmfV(a, W0, P), 12);
    expect(instantaneousEmfV(a, -W0, P)).toBeCloseTo(-instantaneousEmfV(a, W0, P), 12);
  });

  it('is silent at rest, and its frequency does not depend on the direction of turning', () => {
    expect(peakEmfV(0, P)).toBe(0);
    expect(instantaneousEmfV(1.2, 0, P)).toBe(0);
    expect(emfFrequencyHz(-W0, P)).toBe(emfFrequencyHz(W0, P));
  });

  it('doubles in frequency with two pole pairs, at the same speed', () => {
    expect(emfFrequencyHz(W0, { ...P, generatorPolePairs: 2 })).toBeCloseTo(16, 12);
  });
  it('brakes, when shorted, with exactly the heat this waveform makes in the coil: the mean of e²/R, over ω', () => {
    // Decision 35: the brake the dynamics use must be the one the drawn sine
    // would give. Integrate e(θ)²/R over a turn and divide by ω to get the
    // torque, and compare it with the model's full brake.
    for (const polePairs of [1, 2]) {
      const params = { ...P, generatorPolePairs: polePairs };
      for (const omega of [W0 / 4, W0, 2 * W0]) {
        const heatW = meanOverTurn((a) => instantaneousEmfV(a, omega, params) ** 2 / params.coilResistanceOhm);
        // sin² has no kink, so the midpoint rule on 4,096 points is exact to
        // float rounding for a whole number of cycles; 10⁻¹² is rounding.
        expect(Math.abs(heatW / omega / maxBrakeTorqueNm(omega, params) - 1)).toBeLessThan(1e-12);
      }
    }
  });

  it('brakes π²/8 = 1.2337 times harder than the rectified mean EMF alone would, (mean |e|)²/(R·ω)', () => {
    const naiveNm = emfV(W0, P) ** 2 / (P.coilResistanceOhm * W0);
    expect(maxBrakeTorqueNm(W0, P) / naiveNm).toBeCloseTo(1.2337, 4);
  });
});
