import { describe, expect, it } from 'vitest';
import { createAveragedState, icSustainOmegaRadS, runAveragedScenario } from '../../src/sim/averaged.ts';
import { windFraction } from '../../src/sim/mainspring.ts';
import { POWER_RESERVE_H, ROTOR_TARGET_REV_S } from '../../src/sim/params.ts';
import { SECONDS_PER_HOUR } from '../../src/sim/units.ts';
import { P, revS } from './helpers.ts';

// Test 4 (PLAN.md): from full wind, regulation holds for roughly 72 h (±10%),
// then the glide wheel falls below 8 rev/s, the IC browns out, and the wheel
// stops. The times and speeds asserted are the ones PHYSICS.md states under
// Model predictions, from D5.
//
// Sampled every second, the averaged step, so each event's time is known to
// the step. The run is deterministic, so where PHYSICS.md states a time to
// the second, it is asserted to the second.

const { samples, regimes, final } = runAveragedScenario({
  params: P,
  initial: createAveragedState(P, { windFraction: 1 }),
  controls: { brakeEnabled: true },
  durationS: 76 * SECONDS_PER_HOUR,
  sampleIntervalS: 1,
});

const firstIndex = (test: (i: number) => boolean) => samples.findIndex((_, i) => test(i));
const regulationEnds = firstIndex((i) => regimes[i] !== 'regulated');
const brownout = firstIndex((i) => !samples[i]!.icOn);
const stall = firstIndex((i) => regimes[i] === 'stalled');

describe('test 4: rundown', () => {
  it('holds regulation from full wind for 70.645 h, the 254,321 s PHYSICS.md derives', () => {
    expect(samples[regulationEnds - 1]!.timeS).toBe(254_321);
    expect(regimes.slice(0, regulationEnds).every((r) => r === 'regulated')).toBe(true);
  });

  it('lands that inside ±10% of the published 72 h reserve', () => {
    const hours = samples[regulationEnds - 1]!.timeS / SECONDS_PER_HOUR;
    expect(Math.abs(hours / POWER_RESERVE_H - 1)).toBeLessThan(0.1);
  });

  it('then slows below 8 rev/s, and keeps slowing, while the IC still runs', () => {
    const tail = samples.slice(regulationEnds, brownout);
    expect(tail.length).toBeGreaterThan(0);
    for (const s of tail) {
      expect(revS(s.rotorOmegaRadS)).toBeLessThan(ROTOR_TARGET_REV_S);
      expect(s.icOn).toBe(true);
      expect(s.duty).toBe(0);
    }
    for (let i = 1; i < tail.length; i++) expect(tail[i]!.rotorOmegaRadS).toBeLessThan(tail[i - 1]!.rotorOmegaRadS);
  });

  it('browns out the IC at 70.848 h, from the 6.433 rev/s where the capacitor falls to 0.6 V', () => {
    expect(samples[brownout]!.timeS).toBe(255_053);
    const before = samples[brownout - 1]!;
    // D5: (0.6 + 0.0025/0.6 + 0.2) V × 8 rev/s per volt = 6.4333 rev/s.
    // 0.0005: half a unit in the last digit PHYSICS.md shows.
    expect(Math.abs(revS(icSustainOmegaRadS(P)) - 6.433)).toBeLessThan(0.0005);
    // 0.003 rev/s: the last sample before brownout is up to one averaged step
    // before the threshold, and here the wheel slows by about 0.002 rev/s a
    // second (from 8 to 6.43 rev/s in the 731 s between the two events).
    expect(revS(before.rotorOmegaRadS)).toBeGreaterThan(revS(icSustainOmegaRadS(P)));
    expect(revS(before.rotorOmegaRadS) - 6.433).toBeLessThan(0.003);
    // 1 mV: just above brownout, one step before it.
    expect(before.capVoltageV - P.icBrownoutV).toBeLessThan(1e-3);
  });

  it('never restarts the IC after it browns out, because the spring can no longer reach 7.6 rev/s', () => {
    expect(samples.slice(brownout).every((s) => !s.icOn)).toBe(true);
  });

  it('stops the glide wheel at 73.725 h, at the 0.00374 of full wind where the drive falls below friction', () => {
    expect(samples[stall]!.timeS).toBe(265_409);
    // Half a unit in the last digit PHYSICS.md shows.
    expect(Math.abs(windFraction(samples[stall]!.barrelAngleRad, P) - 0.00374)).toBeLessThan(5e-6);
    // D3: it stalls from the friction minimum, 2.24 rad/s, about 0.36 rev/s.
    expect(Math.abs(revS(samples[stall - 1]!.rotorOmegaRadS) - 0.357)).toBeLessThan(0.001);
  });

  it('stays stopped: breakaway friction holds a wheel the spring can no longer start', () => {
    const stopped = samples.slice(stall);
    for (const s of stopped) {
      expect(s.rotorOmegaRadS).toBe(0);
      expect(s.rotorAngleRad).toBe(samples[stall]!.rotorAngleRad);
    }
    expect(final.regime).toBe('stalled');
  });

  it('passes through the regimes in order: regulated, slowing, browned out, stopped', () => {
    expect(regulationEnds).toBeLessThan(brownout);
    expect(brownout).toBeLessThan(stall);
    const order = regimes.filter((r, i) => i === 0 || r !== regimes[i - 1]);
    expect(order).toEqual(['regulated', 'free', 'stalled']);
  });

  it('balances energy over the whole run-down: what the spring released equals every loss booked', () => {
    const e = final.energy;
    const lossesJ = e.trainLossJ + e.frictionJ + e.coilJ + e.rectifierJ + e.icJ;
    // 10⁻⁹: each operating point balances its own mean drive exactly (the
    // duty, speed, and capacitor are solved for it), so only float rounding
    // and bisection to double precision remain, over 265,000 steps. Measured
    // at 3 × 10⁻¹¹.
    expect(Math.abs(e.springJ - lossesJ) / e.springJ).toBeLessThan(1e-9);
  });

  it('spends the energy the way PHYSICS.md budgets it', () => {
    const e = final.energy;
    // PHYSICS.md, Energy budget, to the precision it shows. 0.0015 J: the
    // budget is for the regulated 70.6 h only; the 3 h after it add friction
    // and 15 minutes more of IC.
    expect(Math.abs(e.springJ - 0.5161)).toBeLessThan(0.0015);
    expect(Math.abs(e.trainLossJ - 0.2056)).toBeLessThan(0.0015);
    expect(Math.abs(e.frictionJ - 0.122)).toBeLessThan(0.0015);
    expect(Math.abs(e.coilJ - 0.1785)).toBeLessThan(0.0015);
    expect(Math.abs(e.icJ - 0.0064)).toBeLessThan(0.0001);
  });
});
