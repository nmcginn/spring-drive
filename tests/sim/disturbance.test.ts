import { describe, expect, it } from 'vitest';
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
});
