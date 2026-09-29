import { describe, expect, it } from 'vitest';
import {
  curveTorqueNm,
  fullWindAngleRad,
  mainspringEnergyJ,
  mainspringTorqueNm,
  windBarrel,
  windFraction,
} from '../../src/sim/mainspring.ts';
import { MAINSPRING_TORQUE_CURVE } from '../../src/sim/params.ts';
import { P } from './helpers.ts';

const FULL = fullWindAngleRad(P);

describe('the mainspring', () => {
  it('passes through every point of the curve PHYSICS.md tabulates', () => {
    for (const [x, t] of MAINSPRING_TORQUE_CURVE) expect(mainspringTorqueNm(x * FULL, P)).toBeCloseTo(t, 15);
  });

  it('interpolates linearly between points: halfway from 0.5 to 0.9 is the mean of 12 and 13.2 mN·m', () => {
    expect(mainspringTorqueNm(0.7 * FULL, P)).toBeCloseTo(0.0126, 15);
  });

  it('gives no torque when let down, and never more than full-wind torque beyond full wind', () => {
    expect(mainspringTorqueNm(0, P)).toBe(0);
    expect(mainspringTorqueNm(-1, P)).toBe(0);
    expect(mainspringTorqueNm(2 * FULL, P)).toBe(0.016);
  });

  it('never rises as the spring unwinds, which is what makes a torque curve physical', () => {
    let previous = Infinity;
    for (let x = 1; x >= 0; x -= 0.001) {
      const t = curveTorqueNm(MAINSPRING_TORQUE_CURVE, x);
      expect(t).toBeLessThanOrEqual(previous + 1e-15);
      previous = t;
    }
  });

  it('stores the 0.5161 J PHYSICS.md derives at full wind (D2)', () => {
    // D2 rounds to four figures.
    expect(mainspringEnergyJ(FULL, P)).toBeCloseTo(0.5161, 4);
  });

  it('stores energy equal to a fine numerical integral of the torque, at any wind', () => {
    for (const x of [0.02, 0.3, 0.95, 1]) {
      const n = 20000;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += mainspringTorqueNm(((i + 0.5) / n) * x * FULL, P);
      // A midpoint rule on straight segments is exact except at the kinks,
      // where each of 20,000 slices can be off by at most a few 10⁻¹⁰ J.
      expect(mainspringEnergyJ(x * FULL, P)).toBeCloseTo((sum / n) * x * FULL, 8);
    }
  });

  it('sums, in one pass, exactly the trapezoids under curveTorqueNm that define the stored energy', () => {
    // The definition, written the slow way: each segment's trapezoid, with
    // the torque at its end read from curveTorqueNm. The fast sum must agree
    // to the last bit, not to a tolerance, so that speeding it up (decision
    // 39) cannot have moved any number in PHYSICS.md.
    function definitionJ(barrelAngleRad: number): number {
      const fraction = windFraction(barrelAngleRad, P);
      let area = 0;
      for (let i = 1; i < MAINSPRING_TORQUE_CURVE.length; i++) {
        const [x0, t0] = MAINSPRING_TORQUE_CURVE[i - 1] ?? [0, 0];
        const [x1] = MAINSPRING_TORQUE_CURVE[i] ?? [0, 0];
        if (fraction <= x0) break;
        const xEnd = Math.min(fraction, x1);
        area += ((t0 + curveTorqueNm(MAINSPRING_TORQUE_CURVE, xEnd)) / 2) * (xEnd - x0);
      }
      return area * FULL;
    }
    const knots = MAINSPRING_TORQUE_CURVE.map(([x]) => x);
    const fractions = [-0.1, 1.2, ...knots, ...Array.from({ length: 1001 }, (_, i) => i / 1000)];
    for (const x of fractions) expect(mainspringEnergyJ(x * FULL, P)).toBe(definitionJ(x * FULL));
  });

  it('reports wind as a fraction, clamped to [0, 1]', () => {
    expect(windFraction(0.25 * FULL, P)).toBeCloseTo(0.25, 15);
    expect(windFraction(-5, P)).toBe(0);
    expect(windFraction(10 * FULL, P)).toBe(1);
  });

  it('slips at full wind: winding past it leaves the barrel at full', () => {
    expect(windBarrel(0.9 * FULL, FULL, P)).toBe(FULL);
    expect(windBarrel(0.5 * FULL, 0.1 * FULL, P)).toBeCloseTo(0.6 * FULL, 12);
    expect(windBarrel(0, -1, P)).toBe(0);
  });
});
