import { describe, expect, it } from 'vitest';
import {
  advanceDetailed,
  advanceSteps,
  applyShock,
  createState,
  phaseErrorRad,
  realignReference,
  runScenario,
  stepDetailed,
  validateParams,
} from '../../src/sim/detailed.ts';
import { lockTimeS } from '../../src/sim/metrics.ts';
import { P, REFERENCE_PERIOD_S, run } from './helpers.ts';

const ON = { brakeEnabled: true };

describe('the detailed stepper', () => {
  it('starts fully wound, at rest, discharged, with the IC off', () => {
    const s = createState(P);
    expect(s.barrelAngleRad).toBeCloseTo(P.barrelTurnsFull * 2 * Math.PI, 12);
    expect(s.rotorOmegaRadS).toBe(0);
    expect(s.capVoltageV).toBe(0);
    expect(s.regulator.icOn).toBe(false);
  });

  it('never changes the state it is given', () => {
    const s = createState(P);
    const copy = structuredClone(s);
    advanceSteps(s, P, ON, 1000);
    applyShock(s, 5, P);
    realignReference(s);
    expect(s).toStrictEqual(copy);
  });

  it('derives time from the step count, so it never drifts', () => {
    const s = advanceSteps(createState(P), P, ON, 4096 * 3);
    expect(s.timeS).toBe(3);
  });

  it('does nothing for a zero-length frame, and keeps the carry', () => {
    const s = createState(P);
    const out = advanceDetailed(s, P, ON, 0, 1e-5);
    expect(out.state).toStrictEqual(s);
    expect(out.carryS).toBe(1e-5);
  });

  it('treats a negative frame gap as zero', () => {
    const s = createState(P);
    expect(advanceDetailed(s, P, ON, -1).state).toStrictEqual(s);
  });

  it('keeps sim time in step with 60 Hz frames via the carry: 600 frames make 10 s to within one step', () => {
    let state = createState(P);
    let carryS = 0;
    for (let i = 0; i < 600; i++) ({ state, carryS } = advanceDetailed(state, P, ON, 1 / 60, carryS));
    expect(Math.abs(state.timeS - 10)).toBeLessThanOrEqual(P.stepS);
  });

  it('survives a huge frame gap (a tab back from the background) and lands where small frames would', () => {
    const big = advanceDetailed(createState(P), P, ON, 30).state;
    const small = advanceSteps(createState(P), P, ON, 30 * 4096);
    expect(big).toStrictEqual(small);
    expect(lockTimeS(run({ durationS: 30 }).samples, P)).not.toBeNull();
  });

  it('steps one step at a time identically to many steps at once', () => {
    let s = createState(P);
    for (let i = 0; i < 200; i++) s = stepDetailed(s, P, ON);
    expect(s).toStrictEqual(advanceSteps(createState(P), P, ON, 200));
  });

  it('adds a shock to the speed and books its energy, but never drives the wheel backwards', () => {
    const s = { ...createState(P), rotorOmegaRadS: 10 };
    const up = applyShock(s, 5, P);
    expect(up.rotorOmegaRadS).toBe(15);
    expect(up.energy.shockJ).toBeCloseTo(0.5 * P.rotorInertiaKgM2 * (225 - 100), 20);
    expect(applyShock(s, -50, P).rotorOmegaRadS).toBe(0);
  });

  it('reports zero phase error while the IC is off, since there is no reference yet', () => {
    const s = { ...createState(P), rotorAngleRad: 123 };
    expect(phaseErrorRad(s, P)).toBe(0);
  });

  it('realigns the reference to the wheel, so re-enabling regulation starts from zero error', () => {
    const runaway = run({ brakeEnabled: false, durationS: 5 }).final;
    expect(Math.abs(phaseErrorRad(runaway, P))).toBeGreaterThan(100);
    const realigned = realignReference(runaway);
    expect(phaseErrorRad(realigned, P)).toBe(0);
    const { samples } = runScenario({
      params: P,
      initial: realigned,
      controls: ON,
      durationS: 15,
      sampleIntervalS: REFERENCE_PERIOD_S,
      shocks: [],
    });
    // From 30 rev/s the wheel must shed 22 rev/s and repay the phase it gains
    // while doing so. No time is predicted for that; the point is that it locks.
    expect(lockTimeS(samples, P)).not.toBeNull();
  });

  it('holds duty at zero with the brake disabled, even with the IC running', () => {
    const { final } = run({ brakeEnabled: false, durationS: 3 });
    expect(final.regulator.icOn).toBe(true);
    expect(final.regulator.duty).toBe(0);
  });

  it('lands shocks at the first step at or after their time', () => {
    const { samples } = run({
      windFraction: 0.5,
      durationS: 6 + 2 * P.stepS,
      sampleIntervalS: P.stepS,
      shocks: [{ timeS: 6, deltaOmegaRadS: 10 }],
    });
    const at = (t: number) => samples.find((s) => s.timeS === t)!.rotorOmegaRadS;
    // One step of the regulated wheel changes speed by far less than 0.1 rad/s.
    // The shock is 10 rad/s, less what one step takes back: the faster wheel's
    // EMF now exceeds the capacitor by about 0.2 V, and the charging current
    // that drives brakes it by about 0.1 rad/s in the step.
    expect(Math.abs(at(6) - at(6 - P.stepS))).toBeLessThan(0.1);
    expect(at(6 + P.stepS) - at(6)).toBeGreaterThan(9.8);
  });

  it.each([
    ['a fractional divider', { referenceDividerStages: 11.5 }],
    ['a step that is not whole crystal cycles', { stepS: 1 / 3000 }],
    ['a start voltage below brownout', { icStartV: 0.5 }],
  ])('rejects %s', (_name, change) => {
    expect(() => validateParams({ ...P, ...change })).toThrow(RangeError);
    expect(() => createState({ ...P, ...change })).toThrow(RangeError);
  });
});
