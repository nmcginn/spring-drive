import { describe, expect, it } from 'vitest';
import { createAveragedState, runAveragedScenario, settle } from '../../src/sim/averaged.ts';
import { POWER_RESERVE_H, POWER_RESERVE_S, ROTOR_TARGET_REV_S } from '../../src/sim/params.ts';
import { windFraction } from '../../src/sim/mainspring.ts';
import { SECONDS_PER_HOUR } from '../../src/sim/units.ts';
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

// The rest of the runaway story, which the runaway widget fast-forwards
// through: the unbraked run-down from full wind, in averaged mode, sampled
// every second. PHYSICS.md, D8 and Model predictions.
describe('the unbraked run-down', () => {
  const NO_BRAKE = { brakeEnabled: false };
  const { samples, regimes } = runAveragedScenario({
    params: P,
    initial: settle(createAveragedState(P, { windFraction: 1 }), P, NO_BRAKE),
    controls: NO_BRAKE,
    durationS: 30 * SECONDS_PER_HOUR,
    sampleIntervalS: 1,
  });
  const brownout = samples.findIndex((s) => !s.icOn);
  const stall = regimes.indexOf('stalled');

  it('browns the IC out at 93,831 s (26.06 h) and stops the wheel at 104,186 s (28.94 h), as PHYSICS.md states', () => {
    // Deterministic, and sampled at the averaged step, so asserted to the
    // second, as test 4 does for the regulated run-down.
    expect(samples[brownout]!.timeS).toBe(93_831);
    expect(samples[stall]!.timeS).toBe(104_186);
  });

  it('runs down in 40% of the published 72 h', () => {
    expect(samples[stall]!.timeS / POWER_RESERVE_S).toBeCloseTo(0.402, 3);
  });

  it('turns the wheel as many times as a regulated run would: the hands show 71.73 h, (1 − 0.00374) × 72 h', () => {
    // D8: the wheel's turns are fixed by the barrel turns it spends, however
    // fast it spends them, so the hands show the reserve less what is left
    // in the spring at the stall. 0.01 h is the precision PHYSICS.md shows.
    const shownH = samples[stall]!.rotorAngleRad / P.rotorTargetOmegaRadS / SECONDS_PER_HOUR;
    expect(shownH).toBeCloseTo(71.73, 2);
    expect(shownH).toBeCloseTo((1 - windFraction(samples[stall]!.barrelAngleRad, P)) * POWER_RESERVE_H, 6);
  });

  it('runs faster than 8 rev/s until the spring is down to the fraction where regulation would have ended, 0.018823', () => {
    // Both are where the drive can no longer hold 8 rev/s against friction
    // and the IC's charging load (D7), so the unbraked wheel slows through
    // 8 rev/s exactly where a regulated one loses lock: at 93,100 s here.
    // The first sample below 8 rev/s comes up to one 1 s step after the
    // crossing, and a step at 8 rev/s unwinds 3.9 × 10⁻⁶ of full wind
    // (PHYSICS.md's averaged-step row), so the sample's fraction is below the
    // crossing's by at most that, and 0.018823 is itself rounded by 5 × 10⁻⁷.
    const slow = samples.findIndex((s) => revS(s.rotorOmegaRadS) < ROTOR_TARGET_REV_S);
    expect(samples[slow]!.timeS).toBe(93_100);
    expect(slow).toBeLessThan(brownout);
    const fraction = windFraction(samples[slow]!.barrelAngleRad, P);
    expect(fraction).toBeLessThanOrEqual(0.018823 + 5e-7);
    expect(fraction).toBeGreaterThanOrEqual(0.018823 - 3.9e-6 - 5e-7);
  });
});
