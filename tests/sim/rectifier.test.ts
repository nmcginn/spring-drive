import { describe, expect, it } from 'vitest';
import { steadyCapVoltageV } from '../../src/sim/averaged.ts';
import { instantaneousEmfV, peakEmfV } from '../../src/sim/generator.ts';
import {
  conductionAngleForShape,
  conductionAngleRad,
  conductionShape,
  rectifierCycle,
  rectifierCycleAtAngle,
} from '../../src/sim/rectifier.ts';
import { P } from './helpers.ts';

// The peak-charging rectifier (PHYSICS.md, D5; decision 37). The closed forms
// are checked against the drawn waveform in generator.test.ts; these are the
// module's own guarantees, and the one approximation it makes.

const R = P.coilResistanceOhm;
const W0 = P.rotorTargetOmegaRadS;

describe('the rectifier over one cycle', () => {
  it('passes nothing while the peak is at or below the threshold', () => {
    expect(rectifierCycle(1, 1, R)).toStrictEqual({ meanA: 0, meanSquareA2: 0, meanPowerW: 0 });
    expect(rectifierCycle(0.5, 1, R).meanA).toBe(0);
    expect(rectifierCycle(0, 0, R).meanA).toBe(0);
    expect(conductionAngleRad(1, 2)).toBe(Math.PI / 2);
  });

  it('with no threshold, passes the rectified mean over R: 2E/(πR)', () => {
    expect(rectifierCycle(1.5, 0, R).meanA).toBeCloseTo((2 * 1.5) / (Math.PI * R), 18);
    // …and its mean square is a sine's, E²/2 over R².
    expect(rectifierCycle(1.5, 0, R).meanSquareA2).toBeCloseTo(1.5 ** 2 / 2 / R ** 2, 24);
  });

  it('splits the power it takes into the threshold and the resistance: p̄ = u·ī + R·ī²', () => {
    for (const [peak, u] of [
      [1.5708, 1.54],
      [1.5708, 0.9],
      [5, 0.3],
    ] as const) {
      const c = rectifierCycle(peak, u, R);
      // 10⁻¹²: the three closed forms share their terms, so only rounding separates them.
      expect(Math.abs((u * c.meanA + R * c.meanSquareA2) / c.meanPowerW - 1)).toBeLessThan(1e-12);
    }
  });

  it('passes less the higher the threshold, down to nothing at the peak', () => {
    let last = Infinity;
    for (let u = 0; u < 1.5708; u += 0.05) {
      const now = rectifierCycle(1.5708, u, R).meanA;
      expect(now).toBeLessThan(last);
      last = now;
    }
  });

  it('gives the same cycle from the conduction angle as from the threshold', () => {
    const peak = 1.5708;
    const u = 1.2;
    const byAngle = rectifierCycleAtAngle(peak, conductionAngleRad(peak, u), R);
    const byThreshold = rectifierCycle(peak, u, R);
    expect(byAngle.meanA).toBeCloseTo(byThreshold.meanA, 18);
    expect(byAngle.meanPowerW).toBeCloseTo(byThreshold.meanPowerW, 18);
  });

  it('has a mean current of 2u·h(α)/(πR), where h is the conduction shape, and inverts h', () => {
    const peak = 2;
    for (const u of [0.3, 1, 1.9]) {
      const a = conductionAngleRad(peak, u);
      expect(rectifierCycle(peak, u, R).meanA).toBeCloseTo((2 * u * conductionShape(a)) / (Math.PI * R), 18);
      // The inverse to 10⁻¹² rad: the solver closes its bracket to adjacent doubles.
      expect(Math.abs(conductionAngleForShape(conductionShape(a)) - a)).toBeLessThan(1e-12);
    }
    expect(conductionShape(Math.PI / 2)).toBeCloseTo(0, 15);
  });
});

describe('holding the capacitor voltage fixed over a cycle', () => {
  it('puts the capacitor within 1 mV of where the circuit, integrated with its ripple, settles at 8 rev/s', () => {
    // The model averages the rectifier over a cycle with the capacitor held
    // at one voltage. In the circuit the IC drains it between the peaks, so it
    // ripples, and each peak charges it from a little lower. Integrate the
    // circuit itself: the sine through R and the rectifier into C, with the
    // IC's constant power out, 20,000 steps a cycle for six cycles, and take
    // the mean over the last.
    const stepsPerCycle = 20_000;
    const dtS = 1 / (8 * stepsPerCycle);
    const model = steadyCapVoltageV(W0, 0, P)!;
    let v = model;
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let n = 0; n < 6 * stepsPerCycle; n++) {
      const e = Math.abs(instantaneousEmfV(W0 * n * dtS, W0, P));
      const iA = Math.max(0, e - v - P.rectifierDropV) / R;
      v += ((iA - P.icPowerW / v) / P.capacitanceF) * dtS;
      if (n >= 5 * stepsPerCycle) {
        sum += v;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    const mean = sum / stepsPerCycle;
    // PHYSICS.md, D5: a ripple of about 10 mV peak to peak, and a mean 0.3 mV
    // below the model's 1.3424 V. 1 mV bounds the gap; the ripple is checked
    // to the millivolt so the claim about it stays true.
    expect(Math.abs(mean - model)).toBeLessThan(1e-3);
    expect(hi - lo).toBeGreaterThan(0.009);
    expect(hi - lo).toBeLessThan(0.011);
    // And it never reaches the peak less the drop, where charging would stop.
    expect(hi).toBeLessThan(peakEmfV(W0, P) - P.rectifierDropV);
  });
});
