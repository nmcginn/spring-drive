import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/rng.ts';
import { randomShocks } from '../../src/sim/shocks.ts';

describe('the seeded RNG and random shocks', () => {
  it('repeats its sequence for the same seed', () => {
    const a = createRng(99);
    const b = createRng(99);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('stays in [0, 1) and spreads over it', () => {
    const r = createRng(5);
    const xs = Array.from({ length: 10000 }, r);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    // A uniform mean of 10,000 draws has a standard error of 0.0029; 0.02 is about 7 of them.
    expect(Math.abs(xs.reduce((a, b) => a + b, 0) / xs.length - 0.5)).toBeLessThan(0.02);
  });

  it('scatters the requested shocks inside the run, sorted, within the size limit, of both signs', () => {
    const shocks = randomShocks(3, 60, 50, 2);
    expect(shocks).toHaveLength(50);
    for (let i = 0; i < shocks.length; i++) {
      expect(shocks[i]!.timeS).toBeGreaterThanOrEqual(0);
      expect(shocks[i]!.timeS).toBeLessThan(60);
      expect(Math.abs(shocks[i]!.deltaOmegaRadS)).toBeLessThanOrEqual(2);
      if (i > 0) expect(shocks[i]!.timeS).toBeGreaterThanOrEqual(shocks[i - 1]!.timeS);
    }
    expect(shocks.some((s) => s.deltaOmegaRadS > 0) && shocks.some((s) => s.deltaOmegaRadS < 0)).toBe(true);
    expect(randomShocks(3, 60, 50, 2)).toStrictEqual(shocks);
  });
});
