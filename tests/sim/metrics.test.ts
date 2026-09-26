import { describe, expect, it } from 'vitest';
import { isLocked, lockTimeS, meanOmegaRadS, rateErrorSPerDay } from '../../src/sim/metrics.ts';
import type { Sample } from '../../src/sim/types.ts';
import { P } from './helpers.ts';

const W0 = P.rotorTargetOmegaRadS;
const T = 0.125;

function sample(timeS: number, turnsAhead = 0, icOn = true, speedFactor = 1): Sample {
  return {
    timeS,
    rotorAngleRad: W0 * speedFactor * timeS,
    rotorOmegaRadS: W0,
    barrelAngleRad: 1,
    capVoltageV: 0.8,
    icOn,
    duty: 0.1,
    phaseErrorRad: turnsAhead * 2 * Math.PI,
  };
}

describe('lock', () => {
  it('measures mean speed from angle over time', () => {
    expect(meanOmegaRadS(sample(0), sample(1))).toBeCloseTo(W0, 12);
  });

  it('holds at exactly target speed and zero phase error, and not with the IC off', () => {
    expect(isLocked(sample(0), sample(T), P)).toBe(true);
    expect(isLocked(sample(0), sample(T, 0, false), P)).toBe(false);
  });

  it('fails when speed is off by more than 0.1%, or phase by more than a hundredth of a turn', () => {
    expect(isLocked(sample(0, 0, true, 1.0009), sample(T, 0, true, 1.0009), P)).toBe(true);
    expect(isLocked(sample(0, 0, true, 1.0011), sample(T, 0, true, 1.0011), P)).toBe(false);
    expect(isLocked(sample(0), sample(T, 0.0099), P)).toBe(true);
    expect(isLocked(sample(0), sample(T, 0.0101), P)).toBe(false);
  });

  it('reports when lock is gained and then held, ignoring an earlier lock that was lost', () => {
    const s = [sample(0), sample(T), sample(2 * T, 0.5), sample(3 * T), sample(4 * T)];
    expect(lockTimeS(s, P)).toBe(3 * T);
  });

  it('reports no lock for a run that ends unlocked, and none from a single sample', () => {
    expect(lockTimeS([sample(0), sample(T), sample(2 * T, 0.5)], P)).toBeNull();
    expect(lockTimeS([sample(0)], P)).toBeNull();
  });

  it('only looks after the given time', () => {
    const s = [sample(0), sample(T), sample(2 * T), sample(3 * T)];
    expect(lockTimeS(s, P, 2 * T)).toBe(3 * T);
  });
});

describe('rate error', () => {
  it('is zero for a wheel at exactly the target speed', () => {
    // 10⁻⁹ s/day: float rounding in an angle of 4.3 × 10⁶ rad.
    expect(Math.abs(rateErrorSPerDay(sample(0), sample(86_400), P))).toBeLessThan(1e-9);
  });

  it('counts a wheel 1 part in 86,400 fast as gaining a second a day, and slow as losing one', () => {
    const fast = 1 + 1 / 86_400;
    expect(rateErrorSPerDay(sample(0, 0, true, fast), sample(3600, 0, true, fast), P)).toBeCloseTo(1, 9);
    const slow = 1 - 1 / 86_400;
    expect(rateErrorSPerDay(sample(0, 0, true, slow), sample(3600, 0, true, slow), P)).toBeCloseTo(-1, 9);
  });
});
