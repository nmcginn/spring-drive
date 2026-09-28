import { describe, expect, it } from 'vitest';
import { advanceAveraged, createAveragedState, powerFlows, settle } from '../../src/sim/averaged.ts';
import type { AveragedState } from '../../src/sim/types.ts';
import { P, revS } from './helpers.ts';

// Where the power reaching the glide wheel goes, in averaged mode (PHYSICS.md,
// D13). The tri-synchro widget draws it as three shares: friction, the
// brake, and the electricity that runs the IC. The wheel is quasi-steady in
// every regime, so the three must add up to what the train delivers, and
// each must agree with what the ledger books for it.

const BRAKE = { brakeEnabled: true };
const NO_BRAKE = { brakeEnabled: false };

/**
 * The balance drive = friction + brake + charging, relative. 10⁻¹¹: each
 * regime's balance is solved to adjacent doubles in the conduction angle
 * (D7), which leaves a residual of a few parts in 10¹³ of the drive
 * (measured: at most 3 × 10⁻¹³, at the end of regulation, where the brake
 * is nearly off and the residual is left to the charging path alone).
 */
const BALANCE_TOLERANCE = 1e-11;

function balance(s: AveragedState, controls = BRAKE): number {
  const f = powerFlows(s, P, controls);
  return (f.frictionW + f.brakeW + f.chargingW) / f.driveW - 1;
}

describe('power flows, regulated', () => {
  it('at full wind: 1.629 µW reaches the wheel, and friction takes 29.4 %, the brake 68.8 %, the electricity 1.79 %', () => {
    const f = powerFlows(createAveragedState(P, { windFraction: 1 }), P, BRAKE);
    // PHYSICS.md, D13, to the digits it states; 10⁻⁴ is half a unit in the last of them.
    expect(f.driveW * 1e6).toBeCloseTo(1.629, 3);
    expect(f.frictionW * 1e6).toBeCloseTo(0.4797, 4);
    expect(f.brakeW * 1e6).toBeCloseTo(1.1201, 4);
    expect(f.chargingW * 1e9).toBeCloseTo(29.19, 2);
    expect(f.icW).toBe(P.icPowerW);
    expect(f.frictionW / f.driveW).toBeCloseTo(0.294, 3);
    expect(f.brakeW / f.driveW).toBeCloseTo(0.688, 3);
    expect(f.chargingW / f.driveW).toBeCloseTo(0.0179, 4);
  });

  it.each([1, 0.5, 0.03])('balances drive against friction, brake, and charging at %s of full wind', (wind) => {
    expect(Math.abs(balance(createAveragedState(P, { windFraction: wind })))).toBeLessThan(BALANCE_TOLERANCE);
  });

  it('gives the brake less as the spring weakens, and the friction and the electricity the same', () => {
    const full = powerFlows(createAveragedState(P, { windFraction: 1 }), P, BRAKE);
    const low = powerFlows(createAveragedState(P, { windFraction: 0.03 }), P, BRAKE);
    expect(low.brakeW).toBeLessThan(full.brakeW / 3);
    // The same 8 rev/s, so the same friction; the capacitor moves by a millivolt, so the charging hardly does.
    expect(low.frictionW).toBe(full.frictionW);
    expect(Math.abs(low.chargingW / full.chargingW - 1)).toBeLessThan(0.002);
  });

  it('agrees with what the ledger books over a step: friction, and the coil, rectifier, and IC together', () => {
    const s0 = createAveragedState(P, { windFraction: 0.5 });
    const f = powerFlows(s0, P, BRAKE);
    const dtS = 1;
    const s1 = advanceAveraged(s0, P, BRAKE, dtS);
    const e0 = s0.energy;
    const e1 = s1.energy;
    // 10⁻⁵: the step books the mean drive over the angle it turns, not the
    // drive at its start, which on the curve's flat middle differs by about
    // a part in 10⁶ over a second; the flows are the start's.
    expect(Math.abs((e1.frictionJ - e0.frictionJ) / dtS / f.frictionW - 1)).toBeLessThan(1e-5);
    const electricJ = e1.coilJ + e1.rectifierJ + e1.icJ - (e0.coilJ + e0.rectifierJ + e0.icJ);
    expect(Math.abs(electricJ / dtS / (f.brakeW + f.chargingW) - 1)).toBeLessThan(1e-5);
  });
});

describe('power flows, unregulated', () => {
  it('with the brake disabled, puts nothing in the brake and balances drive against friction and charging', () => {
    const s = settle(createAveragedState(P, { windFraction: 1 }), P, NO_BRAKE);
    const f = powerFlows(s, P, NO_BRAKE);
    expect(s.regime).toBe('free');
    expect(revS(s.rotorOmegaRadS)).toBeCloseTo(30.61, 2);
    expect(f.brakeW).toBe(0);
    expect(Math.abs(balance(s, NO_BRAKE))).toBeLessThan(BALANCE_TOLERANCE);
  });

  it('after regulation ends, with the IC still on: no brake, and the balance holds as the wheel slows', () => {
    // Fraction 0.0189 is 41 s of regulation from its end at 0.018741 (D7),
    // and 1,963 s from the brownout: this is about 1,000 s between them.
    const s = advanceAveraged(createAveragedState(P, { windFraction: 0.0189 }), P, BRAKE, 1000);
    expect(s.regime).toBe('free');
    expect(s.icOn).toBe(true);
    expect(revS(s.rotorOmegaRadS)).toBeLessThan(8);
    const f = powerFlows(s, P, BRAKE);
    expect(f.brakeW).toBe(0);
    expect(f.chargingW).toBeGreaterThan(P.icPowerW);
    expect(Math.abs(balance(s))).toBeLessThan(BALANCE_TOLERANCE);
  });

  it('after brownout: nothing charges, and friction takes everything', () => {
    // Past the brownout, 1,963 s on, and before the stall, 11,289 s on (D7).
    const s = advanceAveraged(createAveragedState(P, { windFraction: 0.0189 }), P, BRAKE, 5000);
    expect(s.icOn).toBe(false);
    expect(s.regime).toBe('free');
    const f = powerFlows(s, P, BRAKE);
    expect([f.brakeW, f.chargingW, f.icW]).toEqual([0, 0, 0]);
    expect(Math.abs(f.frictionW / f.driveW - 1)).toBeLessThan(BALANCE_TOLERANCE);
  });

  it('holding back, with the full brake on and the IC on the capacitor: nothing charges, and the IC still draws', () => {
    const runaway = advanceAveraged(createAveragedState(P, { windFraction: 1 }), P, NO_BRAKE, 10);
    const s = settle(runaway, P, BRAKE);
    expect(s.regime).toBe('holding-back');
    const f = powerFlows(s, P, BRAKE);
    expect(f.chargingW).toBe(0);
    expect(f.icW).toBe(P.icPowerW);
    expect(Math.abs(balance(s))).toBeLessThan(BALANCE_TOLERANCE);
  });

  it('stopped, with a run-down spring: no power anywhere', () => {
    const s = createAveragedState(P, { windFraction: 0 });
    expect(s.regime).toBe('stalled');
    expect(powerFlows(s, P, BRAKE)).toEqual({ driveW: 0, frictionW: 0, brakeW: 0, chargingW: 0, icW: 0 });
  });

  it('never changes the state it is given', () => {
    const s = createAveragedState(P, { windFraction: 0.5 });
    const copy = structuredClone(s);
    powerFlows(s, P, BRAKE);
    expect(s).toEqual(copy);
  });
});
