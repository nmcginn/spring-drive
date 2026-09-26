import { describe, expect, it } from 'vitest';
import { capEnergyJ, icCurrentA, nextCapVoltageV, nextIcOn } from '../../src/sim/power.ts';
import { P } from './helpers.ts';

describe('the power supply', () => {
  it('starts the IC only at 0.75 V, and stops it only below 0.6 V', () => {
    expect(nextIcOn(false, 0.74, P)).toBe(false);
    expect(nextIcOn(false, 0.75, P)).toBe(true);
    expect(nextIcOn(true, 0.61, P)).toBe(true);
    expect(nextIcOn(true, 0.59, P)).toBe(false);
  });

  it('draws constant power: 25 nW is 31.4 nA at 0.7965 V (D5)', () => {
    expect(icCurrentA(true, 0.7965, P)).toBeCloseTo(3.139e-8, 11);
    expect(icCurrentA(false, 0.7965, P)).toBe(0);
  });

  it('charges the capacitor by (i_in − i_out)/C, and never below zero', () => {
    expect(nextCapVoltageV(0.5, 1e-6, 0, 0.01, P)).toBeCloseTo(0.5 + (1e-6 / P.capacitanceF) * 0.01, 12);
    expect(nextCapVoltageV(0.001, 0, 1, 1, P)).toBe(0);
  });

  it('holds ½CV²', () => {
    expect(capEnergyJ(0.8, P)).toBeCloseTo(0.5 * P.capacitanceF * 0.64, 20);
  });
});
