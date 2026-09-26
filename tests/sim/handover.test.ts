import { describe, expect, it } from 'vitest';
import {
  advanceAveraged,
  averagedFromDetailed,
  createAveragedState,
  detailedFromAveraged,
  settle,
  windAveraged,
} from '../../src/sim/averaged.ts';
import { advanceSteps, createState, runScenario, storedEnergyJ, windDetailed } from '../../src/sim/detailed.ts';
import { fullWindAngleRad, mainspringEnergyJ, windFraction } from '../../src/sim/mainspring.ts';
import { lockTimeS } from '../../src/sim/metrics.ts';
import { LOCK_PHASE_TOLERANCE_RAD, LOCK_SPEED_TOLERANCE } from '../../src/sim/params.ts';
import type { EnergyLedger } from '../../src/sim/types.ts';
import { P, REFERENCE_PERIOD_S, revS } from './helpers.ts';

// Widgets move between the two modes: the intro opens on a movement already
// running (averaged mode's settled state, carried on in detailed mode), and
// the runaway widget fast-forwards in averaged mode and comes back to
// detailed. They also wind the spring. These tests pin down what survives
// each handover, and that winding keeps the energy ledger closed.

const BRAKE = { brakeEnabled: true };
const NO_BRAKE = { brakeEnabled: false };
const FULL = fullWindAngleRad(P);

function losses(e: EnergyLedger): number {
  return e.trainLossJ + e.frictionJ + e.coilJ + e.rectifierJ + e.icJ;
}

describe('detailed mode carried on from a settled averaged state', () => {
  it.each([1, 0.5, 0.03])('is locked from its first reference tick at wind %s, with no relock transient', (wind) => {
    const initial = detailedFromAveraged(createAveragedState(P, { windFraction: wind }), P);
    const { samples } = runScenario({
      params: P,
      initial,
      controls: BRAKE,
      durationS: 20,
      sampleIntervalS: REFERENCE_PERIOD_S,
      shocks: [],
    });
    // Lock is judged at the end of each reference period, so the first
    // possible lock time is one period in.
    expect(lockTimeS(samples, P)).toBe(REFERENCE_PERIOD_S);
    for (const s of samples) {
      // The lock tolerances themselves (PHYSICS.md): the handover must never
      // leave them, not just regain them.
      expect(Math.abs(s.rotorOmegaRadS / P.rotorTargetOmegaRadS - 1)).toBeLessThan(LOCK_SPEED_TOLERANCE);
      expect(Math.abs(s.phaseErrorRad)).toBeLessThan(LOCK_PHASE_TOLERANCE_RAD);
    }
  });

  it('starts on the steady duty and capacitor voltage PHYSICS.md derives at full wind', () => {
    const d = detailedFromAveraged(createAveragedState(P, { windFraction: 1 }), P);
    // D4 and D5 give these to three and four significant figures.
    expect(d.regulator.duty).toBeCloseTo(0.112, 3);
    expect(d.capVoltageV).toBeCloseTo(0.7965, 4);
    expect(d.regulator.icOn).toBe(true);
    expect(d.rotorOmegaRadS).toBe(P.rotorTargetOmegaRadS);
  });

  it('rounds time to a whole detailed step, so reference ticks still land on steps', () => {
    const a = { ...createAveragedState(P), timeS: 10.00007 };
    const d = detailedFromAveraged(a, P);
    expect(Number.isInteger(d.step)).toBe(true);
    expect(d.timeS).toBe(d.step * P.stepS);
    expect(Math.abs(d.timeS - a.timeS)).toBeLessThanOrEqual(P.stepS / 2);
  });

  it('keeps angle, barrel, speed, capacitor, and ledger across the handover', () => {
    const a = advanceAveraged(createAveragedState(P, { windFraction: 0.8 }), P, NO_BRAKE, 3600);
    const d = detailedFromAveraged(a, P);
    expect(d.rotorAngleRad).toBe(a.rotorAngleRad);
    expect(d.barrelAngleRad).toBe(a.barrelAngleRad);
    expect(d.rotorOmegaRadS).toBe(a.rotorOmegaRadS);
    expect(d.capVoltageV).toBe(a.capVoltageV);
    expect(d.energy).toEqual(a.energy);
    expect(d.energy).not.toBe(a.energy);
  });

  it('carries a phase error over, measured against the new reference', () => {
    const a = { ...createAveragedState(P), phaseErrorRad: 0.3, regime: 'holding-back' as const, duty: 1 };
    const d = detailedFromAveraged(a, P);
    expect(d.rotorAngleRad - d.regulator.referenceOriginRad).toBeCloseTo(0.3, 12);
    expect(d.regulator.lastPhaseErrorRad).toBe(0.3);
  });

  it('has no reference and no duty when the IC is off', () => {
    const a = createAveragedState(P, { windFraction: 0 });
    expect(a.icOn).toBe(false);
    const d = detailedFromAveraged(a, P);
    expect(d.regulator.icOn).toBe(false);
    expect(d.regulator.duty).toBe(0);
    expect(d.regulator.integralRadS).toBe(0);
  });

  it('round-trips through averagedFromDetailed without changing the physics', () => {
    const a = createAveragedState(P, { windFraction: 0.5 });
    const back = settle(averagedFromDetailed(detailedFromAveraged(a, P), P), P, BRAKE);
    expect(back.regime).toBe('regulated');
    expect(back.rotorOmegaRadS).toBe(a.rotorOmegaRadS);
    expect(back.duty).toBeCloseTo(a.duty, 12);
    expect(back.capVoltageV).toBeCloseTo(a.capVoltageV, 12);
  });

  it('continues an unbraked run-down where averaged mode left it, within the quasi-steady lag', () => {
    // An hour of unbraked running in averaged mode, then a second more in
    // each mode. Test 7 bounds the modes' unregulated disagreement at 2 × 10⁻⁴
    // of the speed (PHYSICS.md, Model predictions); the handover must not add
    // a transient of its own on top.
    const a = advanceAveraged(settle(createAveragedState(P), P, NO_BRAKE), P, NO_BRAKE, 3600);
    const viaAveraged = advanceAveraged(a, P, NO_BRAKE, 1);
    const viaDetailed = advanceSteps(detailedFromAveraged(a, P), P, NO_BRAKE, 4096);
    expect(Math.abs(viaDetailed.rotorOmegaRadS / viaAveraged.rotorOmegaRadS - 1)).toBeLessThan(2e-4);
  });
});

describe('winding', () => {
  it('winds the barrel, and books the work as wind energy that the spring took in (detailed)', () => {
    const s = advanceSteps(createState(P, { windFraction: 0.5 }), P, NO_BRAKE, 4096);
    const before = storedEnergyJ(s, P).springJ;
    const wound = windDetailed(s, 0.2 * FULL, P);
    const added = storedEnergyJ(wound, P).springJ - before;
    expect(added).toBeGreaterThan(0);
    expect(wound.energy.springJ).toBeCloseTo(s.energy.springJ - added, 15);
    expect(wound.energy.windJ).toBeCloseTo(added, 15);
    expect(wound.rotorOmegaRadS).toBe(s.rotorOmegaRadS);
    expect(wound.rotorAngleRad).toBe(s.rotorAngleRad);
  });

  it('keeps the detailed ledger closed across a wind', () => {
    let s = createState(P, { windFraction: 0.2 });
    const initialSpringJ = mainspringEnergyJ(s.barrelAngleRad, P);
    s = advanceSteps(s, P, NO_BRAKE, 4096 * 5);
    s = windDetailed(s, FULL, P);
    s = advanceSteps(s, P, NO_BRAKE, 4096 * 5);
    const stored = storedEnergyJ(s, P);
    // The spring's energy now, plus what it released net of what it took in,
    // is what it started with: exact but for float rounding on 0.5 J.
    expect(stored.springJ + s.energy.springJ).toBeCloseTo(initialSpringJ, 12);
    // And test 5's balance holds with the wind counted as an input, at test
    // 5's own tolerance of 1 part in 10⁵ (decision 22). The run started at
    // rest with the capacitor empty, so kinetic and capacitor energy now are
    // their changes.
    const inJ = s.energy.springJ + s.energy.windJ + s.energy.shockJ;
    const outJ = losses(s.energy) + stored.kineticJ + stored.capJ;
    expect(s.energy.windJ).toBeGreaterThan(0.3);
    expect(Math.abs(inJ - outJ) / inJ).toBeLessThan(1e-5);
  });

  it('stops at full wind, where the bridle slips, and books nothing past it', () => {
    const s = createState(P, { windFraction: 1 });
    const wound = windDetailed(s, FULL, P);
    expect(wound.barrelAngleRad).toBe(FULL);
    expect(wound.energy.springJ).toBe(0);
    expect(wound.energy.windJ).toBe(0);
  });

  it('restarts a run-down, stalled movement in averaged mode, unbraked', () => {
    let a = settle(createAveragedState(P, { windFraction: 0.002 }), P, NO_BRAKE);
    expect(a.regime).toBe('stalled');
    a = windAveraged(a, FULL, P, NO_BRAKE);
    expect(windFraction(a.barrelAngleRad, P)).toBe(1);
    expect(a.regime).toBe('free');
    // The unbraked full-wind speed of PHYSICS.md's Model predictions,
    // 30.61 rev/s, to its shown precision.
    expect(revS(a.rotorOmegaRadS)).toBeCloseTo(30.61, 1);
    expect(a.energy.windJ).toBeGreaterThan(0);
    expect(a.energy.springJ).toBe(-a.energy.windJ);
  });
});
