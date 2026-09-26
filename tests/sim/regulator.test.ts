import { describe, expect, it } from 'vitest';
import { regulatorUpdate } from '../../src/sim/regulator.ts';
import { P } from './helpers.ts';

const T = 1 / 8;

describe('the regulator', () => {
  it('brakes harder when the wheel is ahead, and not at all when it is behind', () => {
    expect(regulatorUpdate(0, 1, 1, P).duty).toBeGreaterThan(0);
    expect(regulatorUpdate(0, -1, -1, P).duty).toBe(0);
  });

  it('combines phase, accumulated phase, and speed over the last period', () => {
    const out = regulatorUpdate(2, 1.5, 1, P);
    const integral = 2 + 1.5 * T;
    const expected = P.regulatorKpPerRad * 1.5 + P.regulatorKiPerRadS * integral + P.regulatorKdPerRadS * (0.5 / T);
    expect(out.integralRadS).toBeCloseTo(integral, 15);
    expect(out.duty).toBeCloseTo(expected, 15);
  });

  it('clamps duty to [0, 1]', () => {
    expect(regulatorUpdate(0, 1000, 0, P).duty).toBe(1);
    expect(regulatorUpdate(0, -1000, 0, P).duty).toBe(0);
  });

  it('stops integrating while pinned and pushed further, so a long lag leaves no debt', () => {
    expect(regulatorUpdate(0, -1000, -1000, P).integralRadS).toBe(0);
    expect(regulatorUpdate(5, 1000, 1000, P).integralRadS).toBe(5);
  });

  it('keeps integrating when the error is pulling a pinned duty back', () => {
    // Integral large enough to pin at 1, error negative: it should unwind.
    const out = regulatorUpdate(100, -1, -1, P);
    expect(out.integralRadS).toBeCloseTo(100 - T, 12);
  });
});
