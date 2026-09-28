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
    expect(generatorTorqueNm(shorted, W0, P)).toBeCloseTo(maxBrakeTorqueNm(W0, P), 18);
  });

  it("brakes in proportion to duty: τ = d·(π²/8)·k_e²·ω/R, PLAN.md's k_e²·ω/R_eff with R_eff = R/(d·π²/8)", () => {
    // With the capacitor above the EMF's peak, only the brake path conducts.
    for (const d of [0, 0.1, 0.5]) {
      expect(generatorTorqueNm(coilCurrents(W0, 5, d, P), W0, P)).toBeCloseTo(d * maxBrakeTorqueNm(W0, P), 18);
    }
  });

  it("charges only while the EMF's peak exceeds the capacitor voltage plus the rectifier drop", () => {
    // D5: the peak at 8 rev/s is π/2 V, so the rectifier stops conducting
    // with the capacitor at π/2 − 0.2 = 1.3708 V, not at the mean's 0.8 V.
    const top = peakEmfV(W0, P) - P.rectifierDropV;
    expect(coilCurrents(W0, top + 1e-9, 0, P).chargeA).toBe(0);
    expect(coilCurrents(W0, top - 1e-3, 0, P).chargeA).toBeGreaterThan(0);
    expect(coilCurrents(W0, 0.8, 0, P).chargeA).toBeGreaterThan(0);
    // Standing still, nothing flows, and nothing divides by the zero speed.
    const still = coilCurrents(0, 0, 0, P);
    expect(still.chargeA).toBe(0);
    expect(generatorTorqueNm(still, 0, P)).toBe(0);
  });

  it('charges for the unshorted share of the time only', () => {
    const open = coilCurrents(W0, 1.2, 0, P);
    const shared = coilCurrents(W0, 1.2, 0.25, P);
    expect(shared.chargeA).toBeCloseTo(0.75 * open.chargeA, 18);
    expect(shared.chargeW).toBeCloseTo(0.75 * open.chargeW, 18);
  });

  it('turns every watt it takes from the wheel into coil heat, rectifier heat, or capacitor charge', () => {
    for (const [omega, v, d] of [
      [W0, 0.7, 0.1],
      [W0, 1.34, 0.1],
      [W0 * 2, 0.3, 0.6],
      [W0 / 3, 0, 0],
    ] as const) {
      const c = coilCurrents(omega, v, d, P);
      const mechanicalW = generatorTorqueNm(c, omega, P) * omega;
      const { coilW, rectifierW } = coilLossesW(c, d, P);
      expect(coilW + rectifierW + v * c.chargeA).toBeCloseTo(mechanicalW, 18);
    }
  });
});

describe('the charging path against the drawn waveform (D5, M7b)', () => {
  /** Mean of f over one turn of the wheel, by the midpoint rule on n points. */
  function meanOverTurn(f: (angleRad: number) => number, n = 1 << 16): number {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += f(((i + 0.5) * 2 * Math.PI) / n);
    return sum / n;
  }

  /** The rectifier's current at one instant, A: (|e| − V − V_d)/R while |e| is above the threshold, else nothing. */
  function rectifierA(angleRad: number, omega: number, capV: number, params: typeof P): number {
    const e = Math.abs(instantaneousEmfV(angleRad, omega, params));
    return Math.max(0, e - capV - params.rectifierDropV) / params.coilResistanceOhm;
  }

  // The integrand has a kink where the rectifier starts and stops conducting,
  // so the midpoint rule's error goes as the square of the step, relative to
  // the width of the conduction window. At 65,536 points a turn it measures
  // under 2 parts in 10⁸, largest in the narrowest windows (into 1.34 V at
  // 8 rev/s the rectifier conducts for 12% of each half cycle). 10⁻⁶ leaves
  // room for that and says the closed forms are right, not approximately so.
  const cases = [
    { omega: W0, capV: 1.34, polePairs: 1 },
    { omega: W0, capV: 0.8, polePairs: 1 },
    { omega: W0 / 2, capV: 0.5, polePairs: 1 },
    { omega: 3 * W0, capV: 2, polePairs: 1 },
    { omega: W0, capV: 1.2, polePairs: 2 },
  ];

  it.each(cases)(
    'at $omega rad/s into $capV V ($polePairs pole pairs), has the mean current the model charges with',
    ({ omega, capV, polePairs }) => {
      const params = { ...P, generatorPolePairs: polePairs };
      const integrated = meanOverTurn((a) => rectifierA(a, omega, capV, params));
      expect(Math.abs(integrated / coilCurrents(omega, capV, 0, params).chargeA - 1)).toBeLessThan(1e-6);
    },
  );

  it.each(cases)(
    'at $omega rad/s into $capV V, takes from the wheel, and heats the coil, what the drawn waveform does',
    ({ omega, capV, polePairs }) => {
      const params = { ...P, generatorPolePairs: polePairs };
      const c = coilCurrents(omega, capV, 0, params);
      // Power the EMF delivers, |e|·i, over ω: the torque on the wheel.
      const powerW = meanOverTurn(
        (a) => Math.abs(instantaneousEmfV(a, omega, params)) * rectifierA(a, omega, capV, params),
      );
      expect(Math.abs(powerW / omega / generatorTorqueNm(c, omega, params) - 1)).toBeLessThan(1e-6);
      const heatW = meanOverTurn((a) => params.coilResistanceOhm * rectifierA(a, omega, capV, params) ** 2);
      expect(Math.abs(heatW / coilLossesW(c, 0, params).coilW - 1)).toBeLessThan(1e-6);
    },
  );

  it('charges far harder than the mean EMF alone would: at 8 rev/s into 0.7 V, 2.69× the (e − V − V_d)/R the old model used', () => {
    // The mean-EMF model drove 1.0 − 0.7 − 0.2 = 0.1 V through R. The sine,
    // peaking at 1.571 V, conducts from α = asin(0.9/1.571) = 0.610 rad to
    // π − α, and averages (2·1.571·cos α − 0.9·(π − 2α))/π = 0.269 V through R.
    const meanEmfA = (emfV(W0, P) - 0.7 - P.rectifierDropV) / P.coilResistanceOhm;
    const ratio = coilCurrents(W0, 0.7, 0, P).chargeA / meanEmfA;
    // Three digits, as the title states.
    expect(Math.abs(ratio - 2.69)).toBeLessThan(0.005);
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
