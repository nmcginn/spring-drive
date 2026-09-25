import { describe, expect, it } from 'vitest';
import { TAU, radSToRevS, revSToRadS, wrapAngleRad } from '../../src/sim/units.ts';

describe('unit conversions', () => {
  it('converts 8 rev/s to 16π rad/s and back', () => {
    expect(revSToRadS(8)).toBeCloseTo(16 * Math.PI, 12);
    expect(radSToRevS(16 * Math.PI)).toBeCloseTo(8, 12);
  });

  it('wraps angles into [0, 2π)', () => {
    expect(wrapAngleRad(0)).toBe(0);
    expect(wrapAngleRad(TAU)).toBe(0);
    expect(wrapAngleRad(TAU + 1)).toBeCloseTo(1, 12);
    expect(wrapAngleRad(-1)).toBeCloseTo(TAU - 1, 12);
  });

  it('never returns 2π itself, even for a negative angle too small to survive the addition', () => {
    const wrapped = wrapAngleRad(-1e-17);
    expect(wrapped).toBeGreaterThanOrEqual(0);
    expect(wrapped).toBeLessThan(TAU);
  });

  it('keeps precision after 72 hours of turning at 8 rev/s', () => {
    // 72 h × 8 rev/s is about 2 million turns. The wrapped angle must still
    // resolve a hundredth of a degree, which is well under a pixel on any
    // widget. The tolerance is that hundredth of a degree in radians.
    const turns = 72 * 3600 * 8;
    const quarterTurn = TAU / 4;
    const hundredthOfADegreeRad = (0.01 * Math.PI) / 180;
    const error = Math.abs(wrapAngleRad(turns * TAU + quarterTurn) - quarterTurn);
    expect(error).toBeLessThan(hundredthOfADegreeRad);
  });
});
