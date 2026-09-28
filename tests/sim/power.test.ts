import { describe, expect, it } from 'vitest';
import { capEnergyJ, icCurrentA, nextCapVoltageV, nextIcOn } from '../../src/sim/power.ts';
import { P } from './helpers.ts';

describe('the power supply', () => {
  it('starts the IC only at 1.0 V, and stops it only below 0.6 V', () => {
    expect(nextIcOn(false, 0.99, P)).toBe(false);
    expect(nextIcOn(false, 1.0, P)).toBe(true);
    // Once running, it keeps going anywhere between the two (D5).
    expect(nextIcOn(true, 0.8, P)).toBe(true);
    expect(nextIcOn(false, 0.8, P)).toBe(false);
    expect(nextIcOn(true, 0.61, P)).toBe(true);
    expect(nextIcOn(true, 0.59, P)).toBe(false);
  });

  it('draws constant power: 25 nW is 18.66 nA at 1.3400 V, and 41.7 nA at brownout (D5)', () => {
    expect(icCurrentA(true, 1.34, P)).toBeCloseTo(1.8657e-8, 11);
    expect(icCurrentA(true, 0.6, P)).toBeCloseTo(4.1667e-8, 11);
    expect(icCurrentA(false, 1.34, P)).toBe(0);
  });

  it('charges the capacitor by (i_in − i_out)/C, and never below zero', () => {
    expect(nextCapVoltageV(0.5, 1e-6, 0, 0.01, P)).toBeCloseTo(0.5 + (1e-6 / P.capacitanceF) * 0.01, 12);
    expect(nextCapVoltageV(0.001, 0, 1, 1, P)).toBe(0);
  });

  it('holds ½CV²', () => {
    expect(capEnergyJ(0.8, P)).toBeCloseTo(0.5 * P.capacitanceF * 0.64, 20);
  });
});
