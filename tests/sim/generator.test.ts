import { describe, expect, it } from 'vitest';
import { coilCurrents, coilLossesW, emfV, generatorTorqueNm, maxBrakeTorqueNm } from '../../src/sim/generator.ts';
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

  it('brakes in proportion to duty: τ = d·k_e²·ω/R, as PLAN.md writes it with R_eff = R/d', () => {
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
