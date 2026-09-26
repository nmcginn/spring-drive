import { describe, expect, it } from 'vitest';
import { TAU } from '../../src/sim/units.ts';
import { blur } from '../../src/widgets/shared/motion.ts';

// The runaway's four spokes repeat every quarter turn; the generator's
// two-pole magnet every whole turn.
const SPOKES = TAU / 4;

describe('motion blur', () => {
  it('draws a still or slow wheel sharp', () => {
    expect(blur(0, SPOKES)).toEqual({ copies: 1, stepRad: 0, alpha: 1 });
    expect(blur(0.01, SPOKES)).toEqual({ copies: 1, stepRad: 0, alpha: 1 });
    expect(blur(Number.NaN, SPOKES)).toEqual({ copies: 1, stepRad: 0, alpha: 1 });
  });

  it('smears a fast wheel over at most one repeat of its pattern', () => {
    const fast = blur(3.2, SPOKES);
    expect(fast.stepRad * (fast.copies - 1)).toBeCloseTo(SPOKES, 12);
    expect(fast.copies).toBeLessThanOrEqual(12);
    expect(fast.alpha).toBeGreaterThanOrEqual(0.2);
    // An hour a frame in fast-forward is the same smear.
    expect(blur(1e6, SPOKES)).toEqual(fast);
  });

  it('smears a moderate sweep over exactly the angle swept', () => {
    const b = blur(0.3, SPOKES);
    expect(b.stepRad * (b.copies - 1)).toBeCloseTo(0.3, 12);
  });

  it('smears a pattern that repeats once a turn over the whole sweep, up to a turn', () => {
    // The generator at 16 rev/s sweeps 96° a frame at 60 Hz: all of it is drawn.
    const sweep = (16 * TAU) / 60;
    const b = blur(sweep, TAU);
    expect(b.stepRad * (b.copies - 1)).toBeCloseTo(sweep, 12);
    expect(blur(10, TAU).stepRad * (blur(10, TAU).copies - 1)).toBeCloseTo(TAU, 12);
  });

  it('smears backwards turning the same as forwards', () => {
    expect(blur(-0.3, SPOKES)).toEqual(blur(0.3, SPOKES));
  });
});
