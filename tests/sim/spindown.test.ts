import { describe, expect, it } from 'vitest';
import { rotorKineticEnergyJ } from '../../src/sim/rotor.ts';
import {
  advanceCoast,
  coastBrakeTorqueNm,
  coastCoilCurrentA,
  coastFrictionTorqueNm,
  coastKineticEnergyJ,
  createCoast,
  spinDown,
  spinDownTimeS,
  stepCoast,
  type CoastState,
} from '../../src/sim/spindown.ts';
import type { SimParams } from '../../src/sim/types.ts';
import { P } from './helpers.ts';

// The glide wheel let go from 8 rev/s with the spring out of the way, as the
// lenz-brake widget shows it (PHYSICS.md, D10).

const W0 = P.rotorTargetOmegaRadS;

function coastToRest(duty: number, params: SimParams = P): CoastState {
  let s = createCoast(W0);
  while (s.stoppedAtS === null && s.timeS < 60) s = stepCoast(s, duty, params);
  return s;
}

describe('the coil as a brake', () => {
  it('does nothing while open: no current, no torque', () => {
    expect(coastBrakeTorqueNm(W0, 0, P)).toBe(0);
    expect(coastCoilCurrentA(W0, 0, P)).toBe(0);
  });

  it('brakes with 198.9 nN·m and carries 10 µA when shorted all the time at 8 rev/s (D4, D10)', () => {
    // k_e²·ω/R = (1.0 V)² ÷ (100 kΩ × 50.2655 rad/s); e/R = 1.0 V ÷ 100 kΩ.
    expect(coastBrakeTorqueNm(W0, 1, P)).toBeCloseTo(1.9894e-7, 11);
    expect(coastCoilCurrentA(W0, 1, P)).toBeCloseTo(1e-5, 15);
  });

  it('brakes, and carries current, in proportion to the time shorted and to the speed', () => {
    const full = coastBrakeTorqueNm(W0, 1, P);
    for (const d of [0.1, 0.25, 0.5, 0.75]) {
      expect(coastBrakeTorqueNm(W0, d, P)).toBeCloseTo(d * full, 18);
      expect(coastCoilCurrentA(W0, d, P)).toBeCloseTo(d * 1e-5, 18);
    }
    expect(coastBrakeTorqueNm(W0 / 2, 1, P)).toBeCloseTo(full / 2, 18);
  });

  it('shorted all the time at 8 rev/s, brakes 20.85 times harder than friction (D10)', () => {
    const ratio = coastBrakeTorqueNm(W0, 1, P) / coastFrictionTorqueNm(W0, P);
    // PHYSICS.md states it to four figures.
    expect(ratio).toBeCloseTo(20.85, 2);
  });

  it('clamps the duty to [0, 1], and treats a non-number as an open coil', () => {
    expect(coastBrakeTorqueNm(W0, 2, P)).toBe(coastBrakeTorqueNm(W0, 1, P));
    expect(coastBrakeTorqueNm(W0, -1, P)).toBe(0);
    expect(coastBrakeTorqueNm(W0, Number.NaN, P)).toBe(0);
  });
});

describe('spin-down from 8 rev/s', () => {
  // PHYSICS.md, Model predictions, states these to the millisecond. The run
  // is deterministic, so they are held to half a millisecond, two steps of
  // 1/4,096 s: enough for rounding in the last digit, not for a changed model.
  const cases = [
    { duty: 0, stopS: 1.118 },
    { duty: 0.25, stopS: 0.299 },
    { duty: 0.5, stopS: 0.185 },
    { duty: 1, stopS: 0.11 },
  ];
  for (const { duty, stopS } of cases) {
    it(`stops in ${stopS} s with the coil shorted ${duty * 100} % of the time`, () => {
      expect(Math.abs(spinDownTimeS(W0, duty, P)! - stopS)).toBeLessThan(5e-4);
    });
  }

  it('stops sooner the more of the time the coil is shorted', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 10; i++) {
      const t = spinDownTimeS(W0, i / 10, P)!;
      expect(t).toBeLessThan(previous);
      previous = t;
    }
  });

  it('with the Stribeck term removed, matches the closed form for Coulomb and viscous drag', () => {
    // Without breakaway friction, J·dω/dt = −τ_c − b·ω, with b the viscous
    // coefficient plus d·k_e²/R. Then ω(t) = (ω₀ + τ_c/b)·e^(−t·b/J) − τ_c/b,
    // and the wheel stops at t = (J/b)·ln(1 + b·ω₀/τ_c).
    const plain: SimParams = { ...P, frictionStaticNm: P.frictionCoulombNm };
    for (const duty of [0, 0.5, 1]) {
      const b = P.frictionViscousNmSRad + (duty * P.generatorKeVSRad ** 2) / P.coilResistanceOhm;
      const tauS = P.rotorInertiaKgM2 / b;
      const c = P.frictionCoulombNm / b;
      const stopS = tauS * Math.log(1 + W0 / c);
      const run = spinDown(W0, duty, plain, 0.01);
      // Semi-implicit Euler is first order: its error in the stop time grows
      // by about half a step per time constant of decay, and the full brake
      // decays through ln(1 + b·ω₀/τ_c) = 4.9 of them. So allow three steps,
      // 0.73 ms. Measured: 0.23 ms open, 0.60 ms fully shorted.
      expect(Math.abs(run.stopS! - stopS)).toBeLessThan(3 * P.stepS);
      for (const p of run.points.slice(1, -1)) {
        const exact = (W0 + c) * Math.exp(-p.timeS / tauS) - c;
        // The same first-order error, as speed: a few steps' worth of the
        // deceleration at 8 rev/s, (τ_c + b·ω₀)/J × 3 steps, at most 0.3 % of ω₀.
        expect(Math.abs(p.omegaRadS - exact)).toBeLessThan(
          ((P.frictionCoulombNm + b * W0) / P.rotorInertiaKgM2) * 3 * P.stepS,
        );
      }
    }
  });

  it('records its speed at every sample, falling all the way, and ends at rest at the stop', () => {
    const run = spinDown(W0, 0.25, P, 1 / 512);
    expect(run.points[0]).toEqual({ timeS: 0, omegaRadS: W0 });
    for (let i = 1; i < run.points.length; i++) {
      expect(run.points[i]!.timeS).toBeGreaterThan(run.points[i - 1]!.timeS);
      expect(run.points[i]!.omegaRadS).toBeLessThan(run.points[i - 1]!.omegaRadS);
    }
    expect(run.points.at(-1)).toEqual({ timeS: run.stopS, omegaRadS: 0 });
  });
});

describe('where the energy goes', () => {
  it('turns the wheel’s kinetic energy into friction and coil heat exactly, at every step', () => {
    const e0 = rotorKineticEnergyJ(W0, P);
    for (const duty of [0, 0.25, 1]) {
      let s = createCoast(W0);
      while (s.stoppedAtS === null) {
        s = stepCoast(s, duty, P);
        // Booked at each step's mean speed, the ledger is exact for
        // semi-implicit Euler, so only float rounding remains: measured
        // below 3 parts in 10¹⁵ over a whole run.
        expect(Math.abs(s.frictionJ + s.coilJ + coastKineticEnergyJ(s, P) - e0)).toBeLessThan(1e-12 * e0);
      }
    }
  });

  it('sends 0 %, 82 %, and 95 % of it to the coil with the coil shorted 0 %, 25 %, and 100 % of the time (D10)', () => {
    const e0 = rotorKineticEnergyJ(W0, P);
    // PHYSICS.md gives the shares to the whole percent.
    expect(coastToRest(0).coilJ).toBe(0);
    expect(coastToRest(0.25).coilJ / e0).toBeCloseTo(0.82, 2);
    expect(coastToRest(1).coilJ / e0).toBeCloseTo(0.948, 2);
  });
});

describe('the coasting wheel', () => {
  it('never reverses, and stays at rest once stopped', () => {
    let s = coastToRest(1);
    const angle = s.rotorAngleRad;
    for (let i = 0; i < 100; i++) s = stepCoast(s, 1, P);
    expect(s.rotorOmegaRadS).toBe(0);
    expect(s.rotorAngleRad).toBe(angle);
  });

  it('is at rest from the start when let go at rest, or at a negative speed', () => {
    expect(createCoast(0).stoppedAtS).toBe(0);
    expect(createCoast(-5).rotorOmegaRadS).toBe(0);
  });

  it('keeps sim time exactly, frame by frame, as one call does: the carry is kept', () => {
    // Frames of 1/64 s are exact in binary, so 32 of them are exactly 0.5 s,
    // 2,048 steps, and the two ways must agree to the bit.
    let a = createCoast(W0);
    let carry = 0;
    for (let i = 0; i < 32; i++) ({ state: a, carryS: carry } = advanceCoast(a, 0.5, P, 1 / 64, carry));
    const b = advanceCoast(createCoast(W0), 0.5, P, 0.5).state;
    expect(a.step).toBe(2048);
    expect(a).toEqual(b);
  });

  it('at 60 frames a second, loses at most the one step float rounding leaves in the carry', () => {
    // 1/60 is not exact in binary: 30 frames sum to a hair under 0.5 s, and
    // the last step waits in the carry for the next frame.
    let a = createCoast(W0);
    let carry = 0;
    for (let i = 0; i < 30; i++) ({ state: a, carryS: carry } = advanceCoast(a, 0.5, P, 1 / 60, carry));
    expect(2048 - a.step).toBeLessThanOrEqual(1);
    expect(a.step * P.stepS + carry).toBeCloseTo(0.5, 12);
  });

  it('survives a zero, a negative, a non-number, and a ten-minute step', () => {
    const s = createCoast(W0);
    expect(advanceCoast(s, 0.5, P, 0).state).toEqual(s);
    expect(advanceCoast(s, 0.5, P, -1).state).toEqual(s);
    expect(advanceCoast(s, 0.5, P, Number.NaN).state).toEqual(s);
    const long = advanceCoast(s, 0.5, P, 600).state;
    expect(long.rotorOmegaRadS).toBe(0);
    expect(long.stoppedAtS).toBeCloseTo(spinDownTimeS(W0, 0.5, P)!, 12);
    // The clock runs on after the stop, without stepping a wheel at rest.
    expect(long.timeS).toBeCloseTo(600, 9);
  });
});
