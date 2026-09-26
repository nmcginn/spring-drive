import { describe, expect, it } from 'vitest';
import { breakawayTorqueNm, frictionTorqueNm, nextOmegaRadS, rotorKineticEnergyJ } from '../../src/sim/rotor.ts';
import { P } from './helpers.ts';

const DT = P.stepS;

describe('the glide wheel', () => {
  it('feels the 9.542 × 10⁻⁹ N·m of friction PHYSICS.md derives at 8 rev/s (D3)', () => {
    expect(frictionTorqueNm(P.rotorTargetOmegaRadS, P)).toBeCloseTo(9.542e-9, 12);
  });

  it('has its lowest running friction, 2.02 × 10⁻⁹ N·m, at 2.24 rad/s (D3)', () => {
    let minNm = Infinity;
    let atRadS = 0;
    for (let w = 0.01; w < 10; w += 0.001) {
      const f = frictionTorqueNm(w, P);
      if (f < minNm) [minNm, atRadS] = [f, w];
    }
    expect(minNm).toBeCloseTo(2.02e-9, 11);
    expect(atRadS).toBeCloseTo(2.24, 2);
  });

  it('rises toward breakaway friction as it slows to a stop', () => {
    expect(frictionTorqueNm(1e-9, P)).toBeCloseTo(breakawayTorqueNm(P), 15);
    expect(breakawayTorqueNm(P)).toBeGreaterThan(P.frictionCoulombNm);
  });

  it('stays stopped while the drive is below breakaway, and starts once it is above', () => {
    expect(nextOmegaRadS(0, 0.99 * P.frictionStaticNm, 0, DT, P)).toBe(0);
    expect(nextOmegaRadS(0, 1.01 * P.frictionStaticNm, 0, DT, P)).toBeGreaterThan(0);
  });

  it('stops at zero rather than reversing when braked hard', () => {
    expect(nextOmegaRadS(0.001, 0, 1e-6, DT, P)).toBe(0);
  });

  it('accelerates by net torque over inertia', () => {
    const omega = P.rotorTargetOmegaRadS;
    const drive = 3e-8;
    const gen = 1e-8;
    const expected = omega + ((drive - gen - frictionTorqueNm(omega, P)) / P.rotorInertiaKgM2) * DT;
    expect(nextOmegaRadS(omega, drive, gen, DT, P)).toBeCloseTo(expected, 12);
  });

  it('carries ½Jω² of kinetic energy', () => {
    expect(rotorKineticEnergyJ(10, P)).toBeCloseTo(0.5 * P.rotorInertiaKgM2 * 100, 20);
  });
});
