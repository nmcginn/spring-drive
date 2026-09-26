import { describe, expect, it } from 'vitest';
import { POWER_RESERVE_S, ROTOR_TARGET_REV_S } from '../../src/sim/params.ts';
import { barrelAngleForRotorRad, reflectedDriveTorqueNm } from '../../src/sim/train.ts';
import { P } from './helpers.ts';

describe('the going train', () => {
  it('turns the glide wheel 8 rev/s × 72 h in seven barrel turns (D1)', () => {
    const rotorTurns = ROTOR_TARGET_REV_S * POWER_RESERVE_S;
    expect(barrelAngleForRotorRad(rotorTurns, P)).toBeCloseTo(P.barrelTurnsFull, 9);
  });

  it('delivers τ_barrel × 0.6 ÷ 296,228.6 at the glide wheel (D1)', () => {
    expect(reflectedDriveTorqueNm(0.012, P)).toBeCloseTo(2.4306e-8, 12);
  });

  it('passes on exactly the efficiency share of barrel power', () => {
    const barrelNm = 0.014;
    const rotorOmegaRadS = 50;
    const barrelPower = barrelNm * (rotorOmegaRadS / P.gearRatio);
    const rotorPower = reflectedDriveTorqueNm(barrelNm, P) * rotorOmegaRadS;
    expect(rotorPower / barrelPower).toBeCloseTo(P.trainEfficiency, 12);
  });
});
