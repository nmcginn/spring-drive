import { describe, expect, it } from 'vitest';
import { createAveragedState, detailedFromAveraged } from '../../src/sim/averaged.ts';
import { advanceSteps, applyShock, phaseErrorRad } from '../../src/sim/detailed.ts';
import { lockTimeS } from '../../src/sim/metrics.ts';
import { ROTOR_TARGET_OMEGA_RAD_S, SHOCK_DELTA_OMEGA_RAD_S } from '../../src/sim/params.ts';
import { P, run } from './helpers.ts';

// Test 6 (PLAN.md): an impulse to the glide wheel is rejected and lock is
// regained. PHYSICS.md, Model predictions: within 3.0 s of a ±2 rev/s shock
// at any wind. Shocks land at 15 s, well after the 4.125 s slowest lock.

const SHOCK_AT_S = 15;
const RELOCK_WITHIN_S = 3;

describe('test 6: disturbance recovery', () => {
  it.each(
    [1, 0.5, 0.03].flatMap((wind) => [
      [wind, SHOCK_DELTA_OMEGA_RAD_S],
      [wind, -SHOCK_DELTA_OMEGA_RAD_S],
    ]),
  )('at %s of full wind, relocks within 3 s of a %s rad/s shock', (wind, delta) => {
    const { samples } = run({
      windFraction: wind,
      durationS: 30,
      shocks: [{ timeS: SHOCK_AT_S, deltaOmegaRadS: delta }],
    });
    const unlocked = samples.find((s) => s.timeS > SHOCK_AT_S && Math.abs(s.phaseErrorRad) > 0.1);
    expect(unlocked, 'the shock should visibly knock the loop out of lock').toBeDefined();
    const relock = lockTimeS(samples, P, SHOCK_AT_S);
    expect(relock).not.toBeNull();
    expect(relock! - SHOCK_AT_S).toBeLessThanOrEqual(RELOCK_WITHIN_S);
  });

  it('keeps time through a shock: the wheel ends on the same phase as an unshocked run, to a millionth of a turn', () => {
    const shocked = run({
      windFraction: 0.5,
      durationS: 30,
      shocks: [{ timeS: SHOCK_AT_S, deltaOmegaRadS: SHOCK_DELTA_OMEGA_RAD_S }],
    });
    const calm = run({ windFraction: 0.5, durationS: 30 });
    // A phase lock repays the error rather than just restoring speed, so the
    // seconds hand ends where it would have been. The tolerance is far below
    // anything visible; the residue is the loop's last few µrad of settling.
    const diffTurns = (shocked.final.rotorAngleRad - calm.final.rotorAngleRad) / (2 * Math.PI);
    expect(Math.abs(diffTurns)).toBeLessThan(1e-6);
  });

  it('survives a knock that stops the wheel dead: the capacitor holds the IC up and the loop relocks', () => {
    const { samples } = run({
      windFraction: 0.5,
      durationS: 30,
      shocks: [{ timeS: SHOCK_AT_S, deltaOmegaRadS: -ROTOR_TARGET_OMEGA_RAD_S }],
    });
    expect(samples.filter((s) => s.timeS >= SHOCK_AT_S).every((s) => s.icOn)).toBe(true);
    // Not a PHYSICS.md prediction, only a bound: a stop needs a full spin-up
    // (about 2 s) before the phase can be repaid; it measured 3.25 s.
    expect(lockTimeS(samples, P, SHOCK_AT_S)! - SHOCK_AT_S).toBeLessThanOrEqual(5);
  });

  it('swings the phase error, at full wind, +44.6° to +55.6° for a knock forward and −56.4° to −67.3° for one back, by where in the reference period it lands', () => {
    // PHYSICS.md, D12: the loop widget's knock. The IC acts only at ticks, so
    // a knock just after one goes unanswered for most of a period and swings
    // furthest. Sixteen landing points, every 32 steps across a period, from
    // a movement settled at full wind; each run's peak is taken at every step.
    const ON = { brakeEnabled: true };
    const settled = detailedFromAveraged(createAveragedState(P, { windFraction: 1 }), P);
    const stepsPerTick = 512;
    const peaksDeg = (sign: 1 | -1) =>
      Array.from({ length: 16 }, (_, k) => {
        let s = advanceSteps(settled, P, ON, stepsPerTick + k * 32);
        s = applyShock(s, sign * SHOCK_DELTA_OMEGA_RAD_S, P);
        let peak = 0;
        for (let i = 0; i < 2 * 4096; i++) {
          s = advanceSteps(s, P, ON, 1);
          peak = Math.max(peak, sign * phaseErrorRad(s, P));
        }
        return (peak * 180) / Math.PI;
      });
    const forward = peaksDeg(1);
    const back = peaksDeg(-1);
    // To the 0.1° PHYSICS.md states them to.
    expect(Math.min(...forward)).toBeCloseTo(44.6, 1);
    expect(Math.max(...forward)).toBeCloseTo(55.6, 1);
    expect(Math.min(...back)).toBeCloseTo(56.4, 1);
    expect(Math.max(...back)).toBeCloseTo(67.3, 1);
    // The largest swing is from a knock landing right on a tick.
    expect(forward[0]).toBe(Math.max(...forward));
    expect(back[0]).toBe(Math.max(...back));
  });
});
