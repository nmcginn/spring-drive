import { describe, expect, it } from 'vitest';
import { MAX_FRAME_DT_S } from '../../src/runtime/scheduler.ts';
import { phaseErrorRad } from '../../src/sim/detailed.ts';
import { maxBrakeTorqueNm } from '../../src/sim/generator.ts';
import { LOCK_PHASE_TOLERANCE_RAD, SHOCK_DELTA_OMEGA_RAD_S } from '../../src/sim/params.ts';
import { TAU, radSToRevS } from '../../src/sim/units.ts';
import {
  SAMPLE_EVERY_STEPS,
  SCOPE_WINDOW_S,
  STILL_RESPONSE_S,
  WIDE_MIN_PX,
  advanceLoop,
  channelValue,
  currentDuty,
  eventLabel,
  formatOffset,
  formatPhase,
  handsAheadS,
  heightForWidth,
  initialLoopState,
  knock,
  lockedForS,
  loopLayout,
  readouts,
  scopeChannels,
  scopeX,
  setRegulation,
  status,
  stripY,
  timeLabels,
  type LoopState,
} from '../../src/widgets/loop/logic.ts';
import { P } from '../sim/helpers.ts';

const W0 = P.rotorTargetOmegaRadS;
const FRAME_S = 1 / 60;
const SAMPLE_S = SAMPLE_EVERY_STEPS * P.stepS;
const DEG = 360 / TAU;

function frames(state: LoopState, count: number, dtS = FRAME_S): LoopState {
  let s = state;
  for (let i = 0; i < count; i++) s = advanceLoop(s, dtS, P);
  return s;
}

/** Run for `seconds` of sim time in frames of 1/64 s, which is 64 steps, so reference ticks land on frame boundaries. */
function simFor(state: LoopState, seconds: number): LoopState {
  return frames(state, Math.round(seconds * 64), 1 / 64);
}

const values = (s: LoopState) => readouts(s, P).map((r) => r.value);

/** Phase error, in degrees, over the scope points recorded since `fromS`. */
function phaseRangeDeg(s: LoopState, fromS: number): { min: number; max: number } {
  const pts = s.history.filter((p) => p.timeS >= fromS).map((p) => p.phaseErrorRad * DEG);
  return { min: Math.min(...pts), max: Math.max(...pts) };
}

describe('loop: opening', () => {
  it('opens locked at 8 rev/s on the steady full-wind duty, with the readouts PHYSICS.md gives there', () => {
    const s = initialLoopState(P);
    expect(status(s)).toBe('locked');
    // D4: 11.2 % of the time shorted, which is 0.112 × 198.9 nN·m of brake.
    expect(values(s)).toEqual([
      '8.000\u202frev/s',
      '0.0°',
      '11.2\u202f%',
      '22.2\u202fnN·m',
      '0.0\u202fs',
      '0.0\u202fms',
      '100.0\u202f%',
    ]);
    expect(currentDuty(s) * maxBrakeTorqueNm(W0, P) * 1e9).toBeCloseTo(22.2, 1);
  });

  it('opens with the scope already full of the settled state: flat across the whole window', () => {
    const s = initialLoopState(P);
    const first = s.history[0]!;
    const last = s.history.at(-1)!;
    expect(last.timeS - first.timeS).toBeCloseTo(SCOPE_WINDOW_S, 12);
    for (const p of s.history) {
      expect(p.omegaRadS).toBe(W0);
      expect(p.phaseErrorRad).toBe(0);
      expect(p.duty).toBeCloseTo(0.112, 3);
    }
  });

  it('stays locked while left alone: 8 rev/s and zero phase error, with the lock clock running', () => {
    const s = frames(initialLoopState(P), 600);
    expect(status(s)).toBe('locked');
    // The handover from averaged mode is locked from its first tick (tests/sim/handover.test.ts).
    expect(lockedForS(s)).toBeCloseTo(10, 1);
    expect(radSToRevS(s.sim.rotorOmegaRadS)).toBeCloseTo(8, 3);
    expect(Math.abs(phaseErrorRad(s.sim, P))).toBeLessThan(LOCK_PHASE_TOLERANCE_RAD);
    expect(values(s)[0]).toBe('8.000\u202frev/s');
  });

  it('is deterministic: the same actions give the same state', () => {
    const act = () => frames(knock(frames(initialLoopState(P), 30), 1, true, P), 90);
    expect(act()).toEqual(act());
  });
});

describe('loop: a knock', () => {
  it('speeds the wheel up by 2 rev/s at once, and marks the scope where it happened', () => {
    const before = frames(initialLoopState(P), 10);
    const s = knock(before, 1, true, P);
    expect(s.sim.rotorOmegaRadS - before.sim.rotorOmegaRadS).toBeCloseTo(SHOCK_DELTA_OMEGA_RAD_S, 12);
    expect(radSToRevS(SHOCK_DELTA_OMEGA_RAD_S)).toBeCloseTo(2, 3);
    expect(s.events).toEqual([{ timeS: s.sim.timeS, kind: 'faster' }]);
    expect(eventLabel(s.events[0]!)).toBe('knock +');
  });

  // Knocks land on a reference tick, a whole second in, which is where they
  // swing furthest (PHYSICS.md, D12; tests/sim/disturbance.test.ts has the
  // range over the period).
  it('a knock forward on a tick swings the phase error up to +55.6° and the duty above the steady 11.2 %, then relocks within 3.0 s', () => {
    const start = knock(simFor(initialLoopState(P), 1), 1, true, P);
    const t0 = start.sim.timeS;
    const s = frames(start, 360);
    const { min, max } = phaseRangeDeg(s, t0);
    // PHYSICS.md, D12: +55.6° and \u221211.3°, the extremes at every sim step. The
    // scope samples every 1/64 s; near an extreme the phase error barely
    // moves, so a sample lands within 0.2° of it.
    expect(max).toBeGreaterThan(55.4);
    expect(max).toBeLessThanOrEqual(55.65);
    expect(min).toBeGreaterThanOrEqual(-11.35);
    expect(min).toBeLessThan(-11.1);
    const duties = s.history.filter((p) => p.timeS >= t0).map((p) => p.duty);
    expect(Math.max(...duties)).toBeGreaterThan(0.15);
    // Test 6: relock within 3.0 s, and held from then on.
    expect(status(s)).toBe('locked');
    expect(s.lockedSinceS! - t0).toBeLessThanOrEqual(3.0);
  });

  it('a knock back on a tick swings the phase error down to \u221267.3° and the duty below the steady 11.2 %, then relocks within 3.0 s', () => {
    const start = knock(simFor(initialLoopState(P), 1), -1, true, P);
    const t0 = start.sim.timeS;
    const s = frames(start, 360);
    const { min, max } = phaseRangeDeg(s, t0);
    // PHYSICS.md, D12: \u221267.3° and +14.3°, sampled as above.
    expect(min).toBeLessThan(-67.1);
    expect(min).toBeGreaterThanOrEqual(-67.35);
    expect(max).toBeGreaterThan(14.1);
    expect(max).toBeLessThanOrEqual(14.35);
    const duties = s.history.filter((p) => p.timeS >= t0).map((p) => p.duty);
    expect(Math.min(...duties)).toBeLessThan(0.06);
    expect(status(s)).toBe('locked');
    expect(s.lockedSinceS! - t0).toBeLessThanOrEqual(3.0);
  });

  it('loses lock at the first reference tick after the knock, not before: lock is judged at ticks', () => {
    const s = knock(frames(initialLoopState(P), 10), 1, true, P);
    expect(status(s)).toBe('locked');
    // An eighth of a second is a reference period; nine frames is 0.15 s.
    expect(status(frames(s, 9))).toBe('locking');
    expect(values(frames(s, 9))[4]).toBe('0.0\u202fs');
  });

  it('while the widget is still, runs the response at once, so the still frame shows it relocked', () => {
    const before = initialLoopState(P);
    const s = knock(before, 1, false, P);
    expect(s.sim.timeS - before.sim.timeS).toBeCloseTo(STILL_RESPONSE_S, 3);
    expect(s.sweepRad).toBe(0);
    expect(status(s)).toBe('locked');
    expect(phaseRangeDeg(s, before.sim.timeS).max).toBeGreaterThan(55.4);
    // The scope ends now and still covers its window.
    expect(s.history.at(-1)!.timeS).toBeCloseTo(s.sim.timeS, 2);
    expect(s.history.at(-1)!.timeS - s.history[0]!.timeS).toBeGreaterThanOrEqual(SCOPE_WINDOW_S);
  });

  it('a live knock and a still one reach the same movement: stillness only changes when the time is shown', () => {
    const start = initialLoopState(P);
    const still = knock(start, 1, false, P);
    const live = simFor(knock(start, 1, true, P), STILL_RESPONSE_S);
    expect(live.sim.rotorAngleRad).toBe(still.sim.rotorAngleRad);
    expect(live.sim.rotorOmegaRadS).toBe(still.sim.rotorOmegaRadS);
  });
});

describe('loop: regulation off and on', () => {
  it('off, the coil stays open and the wheel runs away toward the unbraked 30.6 rev/s', () => {
    const off = setRegulation(initialLoopState(P), false, true, P);
    expect(status(off)).toBe('regulation off');
    expect(currentDuty(off)).toBe(0);
    expect(off.events.at(-1)?.kind).toBe('off');
    const s = simFor(off, 10);
    // Test 1 and D3: 30.61 rev/s at full wind. The approach is slower than the
    // wheel's own 0.625 s time constant, because while it speeds up it also
    // charges the capacitor (D5); ten seconds is within 0.01 rev/s.
    expect(radSToRevS(s.sim.rotorOmegaRadS)).toBeCloseTo(30.61, 1);
    expect(s.history.filter((p) => p.timeS > off.sim.timeS).every((p) => p.duty === 0)).toBe(true);
    expect(values(s)[2]).toBe('0.0\u202f%');
    expect(values(s)[3]).toBe('0.0\u202fnN·m');
  });

  it('off, the IC still counts, so the phase error it would act on grows by about 22.6 turns a second', () => {
    const off = simFor(setRegulation(initialLoopState(P), false, true, P), 5);
    const later = simFor(off, 1);
    const turnsPerS = (phaseErrorRad(later.sim, P) - phaseErrorRad(off.sim, P)) / TAU;
    // 30.61 \u2212 8 rev/s; the wheel is still gaining the last 0.01 rev/s.
    expect(turnsPerS).toBeCloseTo(22.6, 1);
    expect(values(later)[1]).toMatch(/^\+\d+\.\d\u202fturns$/);
  });

  it('back on, the reference restarts from the wheel, and it relocks 4.75 s later with the hands still ahead', () => {
    const off = simFor(setRegulation(initialLoopState(P), false, true, P), 3);
    const gained = handsAheadS(off, P);
    // PHYSICS.md, D12: three seconds of runaway from 8 rev/s put the hands 6.07 s ahead.
    expect(gained).toBeCloseTo(6.07, 2);
    const on = setRegulation(off, true, true, P);
    expect(phaseErrorRad(on.sim, P)).toBe(0);
    expect(on.events.at(-1)?.kind).toBe('on');
    expect(handsAheadS(on, P)).toBe(gained);
    const s = frames(on, 600);
    expect(status(s)).toBe('locked');
    // PHYSICS.md, D12. Lock is judged at reference ticks, which after the
    // restart fall every 0.125 s from it, so this is exact.
    expect(s.lockedSinceS! - on.sim.timeS).toBe(4.75);
    // The loop repays the phase error since the restart, so the hands end
    // with exactly what the runaway gained: to 0.1 ms, less than the 1.25 ms
    // a locked phase error can be (LOCK_PHASE_TOLERANCE_RAD at 8 rev/s).
    expect(handsAheadS(s, P)).toBeCloseTo(gained, 4);
    expect(values(s)[5]).toMatch(/^\+\d+\.\d\d\u202fs$/);
  });

  it('back on after a runaway, holds 11.5 % until the overcharged capacitor drains, then the steady 11.2 %', () => {
    const on = setRegulation(simFor(setRegulation(initialLoopState(P), false, true, P), 3), true, true, P);
    // D12: unbraked, the capacitor charged far above the 0.80 V it settles at
    // regulated (no clamp, D5). Until it drains the wheel carries no charging
    // load, so the brake takes that too.
    const soon = simFor(on, 10);
    expect(soon.sim.capVoltageV).toBeGreaterThan(2);
    expect(currentDuty(soon)).toBeCloseTo(0.115, 3);
    const later = simFor(soon, 40);
    expect(later.sim.capVoltageV).toBeCloseTo(0.7956, 3);
    expect(currentDuty(later)).toBeCloseTo(0.112, 3);
  });

  it('setting regulation to what it already is changes nothing', () => {
    const s = initialLoopState(P);
    expect(setRegulation(s, true, true, P)).toBe(s);
  });

  it('a knock with regulation off is not pushed back', () => {
    const off = simFor(setRegulation(initialLoopState(P), false, true, P), 5);
    const s = simFor(knock(off, -1, true, P), 0.1);
    expect(status(s)).toBe('regulation off');
    expect(currentDuty(s)).toBe(0);
  });
});

describe('loop: awkward frames', () => {
  it('a zero or negative frame gap changes nothing, and draws the wheel sharp', () => {
    const s = frames(initialLoopState(P), 5);
    const z = advanceLoop(s, 0, P);
    expect(z.sim).toEqual(s.sim);
    expect(z.sweepRad).toBe(0);
    expect(advanceLoop(s, -1, P).sim).toEqual(s.sim);
  });

  it('a huge or broken frame gap, as from a tab back from the background, advances at most one clamped frame', () => {
    const s = initialLoopState(P);
    for (const dt of [1e9, Infinity, Number.NaN]) {
      const next = advanceLoop(s, dt, P);
      expect(next.sim.timeS - s.sim.timeS).toBeLessThanOrEqual(MAX_FRAME_DT_S);
    }
  });

  it('keeps the scope and its marks to the window however long it runs', () => {
    let s = initialLoopState(P);
    for (let i = 0; i < 6; i++) s = frames(knock(s, i % 2 ? 1 : -1, true, P), 300);
    expect(s.history.length).toBeLessThanOrEqual(SCOPE_WINDOW_S / SAMPLE_S + 2);
    expect(s.history[0]!.timeS).toBeGreaterThanOrEqual(s.sim.timeS - SCOPE_WINDOW_S - SAMPLE_S);
    expect(s.events.every((e) => e.timeS >= s.sim.timeS - SCOPE_WINDOW_S)).toBe(true);
    expect(s.events.length).toBeLessThanOrEqual(2);
  });
});

describe('loop: a run-down spring', () => {
  it('too weak to hold 8 rev/s, never locks, and the IC browns out: no reference, no brake, and every readout keeps its unit', () => {
    // Regulation ends at fraction 0.018824 (D7); the IC browns out by 0.016301.
    let s = initialLoopState(P, { windFraction: 0.012 });
    expect(status(s)).not.toBe('locked');
    s = advanceLoop(s, MAX_FRAME_DT_S, P);
    for (let i = 0; i < 100; i++) s = advanceLoop(s, MAX_FRAME_DT_S, P);
    expect(status(s)).toBe('no power');
    expect(currentDuty(s)).toBe(0);
    expect(radSToRevS(s.sim.rotorOmegaRadS)).toBeLessThan(8);
    for (const v of values(s)) expect(v).toMatch(/\u202f\S|°/);
  });

  it('let down, stands still and draws cleanly', () => {
    const s = frames(initialLoopState(P, { windFraction: 0 }), 60);
    expect(s.sim.rotorOmegaRadS).toBe(0);
    expect(status(s)).toBe('no power');
    expect(values(s)[0]).toBe('0.000\u202frev/s');
    expect(values(s)[6]).toBe('0.0\u202f%');
  });
});

describe('loop: readout formatting', () => {
  it('writes the phase error in degrees within a turn, with its sign, and in turns past one', () => {
    expect(formatPhase(0)).toBe('0.0°');
    expect(formatPhase(-1e-6)).toBe('0.0°');
    expect(formatPhase((55.6 / DEG) * 1)).toBe('+55.6°');
    expect(formatPhase(-67.3 / DEG)).toBe('\u221267.3°');
    expect(formatPhase(48.6 * TAU)).toBe('+48.6\u202fturns');
    expect(formatPhase(-2 * TAU)).toBe('\u22122.0\u202fturns');
  });

  it('writes the hands’ offset in milliseconds under a second and seconds above, with its sign', () => {
    expect(formatOffset(0)).toBe('0.0\u202fms');
    expect(formatOffset(-2e-5)).toBe('0.0\u202fms');
    expect(formatOffset(0.0031)).toBe('+3.1\u202fms');
    expect(formatOffset(-0.0031)).toBe('\u22123.1\u202fms');
    expect(formatOffset(6.07)).toBe('+6.07\u202fs');
  });
});

describe('loop: the scope', () => {
  const box = { x: 10, y: 20, width: 160, height: 50 };

  it('puts now at the right edge and the window’s start at the left, clamping older points', () => {
    expect(scopeX(box, 100, 100)).toBe(170);
    expect(scopeX(box, 100 - SCOPE_WINDOW_S, 100)).toBe(10);
    expect(scopeX(box, 100 - SCOPE_WINDOW_S / 2, 100)).toBe(90);
    expect(scopeX(box, 0, 100)).toBe(10);
  });

  it('pins a value off the scale to the strip’s edge and says so', () => {
    expect(stripY(box, 8, 4, 12)).toEqual({ y: 45, clipped: false });
    expect(stripY(box, 30.6, 4, 12)).toEqual({ y: 20, clipped: true });
    expect(stripY(box, 0, 4, 12)).toEqual({ y: 70, clipped: true });
    expect(stripY(box, Number.NaN, 4, 12).clipped).toBe(true);
  });

  it('centres the speed strip on the 8 rev/s target, the phase strip on zero, and holds a knock inside both', () => {
    const [speed, phase, duty] = scopeChannels(P);
    expect(speed?.target).toBe(8);
    expect([speed?.min, speed?.max]).toEqual([4, 12]);
    expect(phase?.target).toBe(0);
    // D12's extremes at full wind: +55.6° and \u221267.3°.
    expect(phase!.max).toBeGreaterThan(55.6);
    expect(phase!.min).toBeLessThan(-67.3);
    // The steady 11.2 % and a knock's 5 % to 16 % fit the duty strip.
    expect(duty!.max).toBeGreaterThan(16);
    expect(duty?.target).toBeNull();
  });

  it('reads each scope point in its strip’s unit', () => {
    const p = { timeS: 0, omegaRadS: W0, phaseErrorRad: Math.PI / 4, duty: 0.112 };
    expect(channelValue(p, 'speed')).toBeCloseTo(8, 12);
    expect(channelValue(p, 'phase')).toBeCloseTo(45, 12);
    expect(channelValue(p, 'duty')).toBeCloseTo(11.2, 12);
  });

  it('labels the time axis every 2 s, with units, ending at now', () => {
    expect(timeLabels().map((l) => l.text)).toEqual([
      '\u22128\u202fs',
      '\u22126\u202fs',
      '\u22124\u202fs',
      '\u22122\u202fs',
      'now',
    ]);
  });

  it('names every kind of event', () => {
    for (const kind of ['faster', 'slower', 'off', 'on'] as const) expect(eventLabel({ timeS: 0, kind })).toBeTruthy();
  });
});

describe('loop: layout', () => {
  it('at 380 px, stacks the wheel over three full-width strips, inside the canvas', () => {
    // A 380 px viewport leaves a 324 px canvas (PHYSICS.md, D11).
    const l = loopLayout(324);
    expect(l.wide).toBe(false);
    expect(l.wheel.radius).toBeGreaterThan(30);
    expect(l.strips).toHaveLength(3);
    for (const s of l.strips) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x + s.width).toBeLessThanOrEqual(324);
      expect(s.y).toBeGreaterThan(l.statusY);
      expect(s.y + s.height).toBeLessThan(l.height);
    }
    expect(heightForWidth(324)).toBe(l.height);
  });

  it('from 520 px, puts the scope beside the wheel', () => {
    const l = loopLayout(WIDE_MIN_PX);
    expect(l.wide).toBe(true);
    for (const s of l.strips) expect(s.x).toBeGreaterThan(l.wheel.cx + l.wheel.radius);
  });

  it('never gives a negative or non-finite size, even at zero width', () => {
    const l = loopLayout(0);
    expect(l.wheel.radius).toBe(0);
    expect(Number.isFinite(l.height)).toBe(true);
    for (const s of l.strips) expect(s.width).toBeGreaterThanOrEqual(0);
  });
});
