import { describe, expect, it } from 'vitest';
import { lockTimeS } from '../../src/sim/metrics.ts';
import { ROTOR_TARGET_REV_S } from '../../src/sim/params.ts';
import { P, revS, run } from './helpers.ts';

// Test 2 (PLAN.md): with the brake enabled at full wind, the glide wheel
// locks to 8 rev/s within a documented time. The times, duties, and voltage
// here are the ones PHYSICS.md states under Model predictions, D4, and D5.
//
// Lock times are asserted exactly. They are quantised to the 0.125 s
// reference period and the simulation is deterministic, so any change in the
// physics that moves one must move PHYSICS.md with it.

describe('test 2: lock', () => {
  it('locks to 8 rev/s 3.75 s after starting from rest at full wind, and holds it', () => {
    const { samples } = run({ durationS: 30 });
    expect(lockTimeS(samples, P)).toBe(3.75);
  });

  it.each([
    [0.5, 4.125],
    [0.03, 4.0],
  ])('locks from rest at %s of full wind in %s s', (wind, seconds) => {
    expect(lockTimeS(run({ windFraction: wind, durationS: 30 }).samples, P)).toBe(seconds);
  });

  it('once locked, turns exactly 8 times a second: 80 turns in the next 10 s, to a thousandth of a turn', () => {
    const { samples } = run({ durationS: 20 });
    const at = (t: number) => samples.find((s) => s.timeS === t)!;
    const turns = (at(20).rotorAngleRad - at(10).rotorAngleRad) / (2 * Math.PI);
    // A thousandth of a turn is the phase error still settling at 10 s (the
    // loop is locked well inside a hundredth); it is 12.5 µs of hand travel.
    expect(Math.abs(turns - 10 * ROTOR_TARGET_REV_S)).toBeLessThan(0.001);
  });

  it.each([
    [1, 0.112],
    [0.5, 0.071],
    [0.03, 0.03],
  ])('settles at %s of full wind to the steady duty PHYSICS.md derives, %s', (wind, duty) => {
    const { final } = run({ windFraction: wind, durationS: 20 });
    // 2%: the derived duty is rounded to three decimals in PHYSICS.md, which
    // is up to 1.7% of 0.03; the barrel unwinding in 20 s moves it by under 0.1%.
    expect(Math.abs(final.regulator.duty / duty - 1)).toBeLessThan(0.02);
  });

  it('holds the capacitor at the 0.7965 V PHYSICS.md derives for 8 rev/s', () => {
    const { final } = run({ windFraction: 0.5, durationS: 20 });
    // 0.5 mV: the derivation rounds to 0.1 mV, and the steady duty it uses
    // (0.888 off) is itself rounded.
    expect(Math.abs(final.capVoltageV - 0.7965)).toBeLessThan(5e-4);
  });

  it('overshoots while locking, but never runs away: under 11 rev/s at full wind', () => {
    const peak = Math.max(...run({ durationS: 10 }).samples.map((s) => revS(s.rotorOmegaRadS)));
    expect(peak).toBeGreaterThan(ROTOR_TARGET_REV_S);
    // PHYSICS.md, Model predictions: 10.9 rev/s. The bound is that figure
    // rounded up; the free-running wheel would pass 30.
    expect(peak).toBeLessThan(11);
  });

  it('cannot lock from a fully run-down spring: the wheel never moves and the IC never starts', () => {
    const { samples, final } = run({ windFraction: 0, durationS: 5 });
    expect(final.rotorOmegaRadS).toBe(0);
    expect(final.rotorAngleRad).toBe(0);
    expect(samples.every((s) => !s.icOn)).toBe(true);
    expect(lockTimeS(samples, P)).toBeNull();
  });
});
