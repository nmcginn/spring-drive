import { describe, expect, it } from 'vitest';
import { ROTOR_TARGET_REV_S } from '../../src/sim/params.ts';
import { windFraction } from '../../src/sim/mainspring.ts';
import { P, revS, run } from './helpers.ts';

// Test 1 (PLAN.md): with the brake disabled at full wind, the glide wheel
// settles well above 8 rev/s. PHYSICS.md, D3 and Model predictions: 30.61 rev/s.

const PREDICTED_RUNAWAY_REV_S = 30.61;

describe('test 1: runaway', () => {
  const { samples, final } = run({ brakeEnabled: false, durationS: 10 });

  it('settles at the 30.61 rev/s PHYSICS.md predicts, 3.8× the target, with the brake disabled at full wind', () => {
    // 0.1%: in 10 s the wheel turns about 300 times, unwinding the barrel by
    // 1.4 × 10⁻⁴ of full wind. On the curve's steep top segment that lowers
    // the drive by 0.04%, and the prediction is for the barrel at exactly full.
    expect(revS(final.rotorOmegaRadS)).toBeGreaterThan(3 * ROTOR_TARGET_REV_S);
    expect(Math.abs(revS(final.rotorOmegaRadS) / PREDICTED_RUNAWAY_REV_S - 1)).toBeLessThan(0.001);
  });

  it('has settled rather than still accelerating: the last second changes speed by under 0.01%', () => {
    // Eight mechanical time constants (J/b = 0.625 s) have passed by 5 s, so
    // only the slow unwinding is left; 0.01% bounds that over one second.
    const oneSecondAgo = samples[samples.length - 9]!;
    expect(Math.abs(final.rotorOmegaRadS / oneSecondAgo.rotorOmegaRadS - 1)).toBeLessThan(1e-4);
  });

  it('never brakes: the duty stays at zero even though the IC powers up', () => {
    expect(samples.some((s) => s.icOn)).toBe(true);
    for (const s of samples) expect(s.duty).toBe(0);
  });

  it('dies fast: it unwinds the spring at 3.8× the regulated rate', () => {
    const regulated = run({ durationS: 10 }).final;
    const used = 1 - windFraction(final.barrelAngleRad, P);
    const usedRegulated = 1 - windFraction(regulated.barrelAngleRad, P);
    // The unregulated wheel turns 3.8× as fast once running, less the few
    // seconds both spend spinning up, so over 10 s it uses at least 3× as much.
    expect(used / usedRegulated).toBeGreaterThan(3);
  });
});
