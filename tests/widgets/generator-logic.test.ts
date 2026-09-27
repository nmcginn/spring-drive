import { describe, expect, it } from 'vitest';
import { instantaneousEmfV } from '../../src/sim/generator.ts';
import { TAU, revSToRadS } from '../../src/sim/units.ts';
import {
  SCOPE_WINDOW_S,
  SLOW_MOTION_RATE,
  WIDE_MIN_PX,
  advanceGenerator,
  angleAtRad,
  emfTrace,
  generatorLayout,
  heightForWidth,
  initialGeneratorState,
  omegaAtRadS,
  readouts,
  rotorAngleRad,
  rotorOmegaRadS,
  scopeGridV,
  scopePoint,
  scopeScaleV,
  setSlowMotion,
  setSpeed,
  speedMaxRevS,
  speedValueText,
  type GeneratorState,
} from '../../src/widgets/generator/logic.ts';
import { P } from '../sim/helpers.ts';

const W0 = P.rotorTargetOmegaRadS;
const FRAME_S = 1 / 60;

function run(state: GeneratorState, frames: number, dtS = FRAME_S): GeneratorState {
  let s = state;
  for (let i = 0; i < frames; i++) s = advanceGenerator(s, dtS);
  return s;
}

/** Zero crossings from negative to positive: one per electrical cycle. */
function risingCrossings(trace: number[]): number {
  let n = 0;
  for (let i = 1; i < trace.length; i++) if (trace[i - 1]! < 0 && trace[i]! >= 0) n += 1;
  return n;
}

describe('generator: the wheel', () => {
  it('opens at the regulated 8 rev/s, with a north pole facing the coil', () => {
    const s = initialGeneratorState(P);
    expect(rotorOmegaRadS(s)).toBe(W0);
    expect(rotorAngleRad(s)).toBeCloseTo(0, 12);
  });

  it('turns at the set speed: 8 rev/s for a second is 8 turns', () => {
    const s = run(initialGeneratorState(P), 60);
    // 60 frames of 1/60 s sum to 1 s to within float rounding.
    expect(rotorAngleRad(s) / TAU).toBeCloseTo(8, 9);
  });

  it('changes speed at once when the reader drags, keeping the magnet where it is', () => {
    const s0 = run(initialGeneratorState(P), 10);
    const s1 = setSpeed(s0, 12, true);
    expect(rotorOmegaRadS(s1)).toBeCloseTo(revSToRadS(12), 12);
    expect(rotorAngleRad(s1)).toBeCloseTo(rotorAngleRad(s0), 12);
    const s2 = run(s1, 30);
    expect(rotorAngleRad(s2) - rotorAngleRad(s1)).toBeCloseTo(revSToRadS(12) * 0.5, 9);
  });

  it('keeps the history before a live change, so the scope shows the old speed scrolling away', () => {
    const s = setSpeed(run(initialGeneratorState(P), 10), 16, true);
    expect(omegaAtRadS(s, s.timeS - 0.1)).toBe(W0);
    expect(omegaAtRadS(s, s.timeS)).toBeCloseTo(revSToRadS(16), 12);
  });

  it('replaces rather than stacks several changes made within one frame', () => {
    let s = run(initialGeneratorState(P), 10);
    const before = s.segments.length;
    for (const v of [9, 10, 11, 12]) s = setSpeed(s, v, true);
    expect(s.segments.length).toBe(before + 1);
    expect(rotorOmegaRadS(s)).toBeCloseTo(revSToRadS(12), 12);
  });

  it('ignores a live change to the speed it already has', () => {
    const s = run(initialGeneratorState(P), 10);
    expect(setSpeed(s, 8, true)).toBe(s);
  });

  it('while still, redraws the whole window at the new speed, since sim time is not moving to show it', () => {
    const s0 = run(initialGeneratorState(P), 10);
    const s1 = setSpeed(s0, 4, false);
    expect(s1.segments).toHaveLength(1);
    expect(omegaAtRadS(s1, s1.timeS - SCOPE_WINDOW_S)).toBeCloseTo(revSToRadS(4), 12);
    expect(rotorAngleRad(s1)).toBeCloseTo(rotorAngleRad(s0), 12);
    expect(s1.timeS).toBe(s0.timeS);
  });

  it('stops dead at zero, and treats a negative speed as zero', () => {
    const s = setSpeed(initialGeneratorState(P), -3, true);
    expect(rotorOmegaRadS(s)).toBe(0);
    const later = run(s, 60);
    expect(rotorAngleRad(later)).toBeCloseTo(rotorAngleRad(s), 12);
    expect(later.sweepRad).toBe(0);
  });

  it('keeps only the history the scope can show, however long the reader drags', () => {
    let s = initialGeneratorState(P);
    for (let i = 0; i < 2000; i++) s = advanceGenerator(setSpeed(s, 1 + (i % 150) / 10, true), FRAME_S);
    // Half a second of frames at 60 Hz is 30 segments, plus the one in force at the window's left edge.
    expect(s.segments.length).toBeLessThanOrEqual(32);
    expect(s.segments[0]!.startS).toBeLessThanOrEqual(s.timeS - SCOPE_WINDOW_S);
  });

  it('records each frame’s sweep for the motion blur: 48° at 8 rev/s and 60 frames a second', () => {
    const s = run(initialGeneratorState(P), 1);
    expect((s.sweepRad * 360) / TAU).toBeCloseTo(48, 9);
  });

  it('starts sharp: no sweep before the first frame', () => {
    expect(initialGeneratorState(P).sweepRad).toBe(0);
  });

  it('runs at an eighth of real time in slow motion', () => {
    const slow = setSlowMotion(initialGeneratorState(P), true);
    const s = run(slow, 60);
    expect(s.timeS).toBeCloseTo(SLOW_MOTION_RATE, 12);
    expect(rotorAngleRad(s) / TAU).toBeCloseTo(1, 9);
  });

  it('treats a zero frame gap as no time, and never runs backwards or on a non-number', () => {
    const s = initialGeneratorState(P);
    expect(advanceGenerator(s, 0).timeS).toBe(0);
    expect(advanceGenerator(s, -1).timeS).toBe(0);
    expect(advanceGenerator(s, Number.NaN).timeS).toBe(0);
  });

  it('takes a clamped 0.1 s step from a tab back from the background as 0.1 s, like any other', () => {
    const s = advanceGenerator(initialGeneratorState(P), 0.1);
    expect(rotorAngleRad(s) / TAU).toBeCloseTo(0.8, 9);
    expect(s.segments).toHaveLength(1);
  });
});

describe('generator: the scope trace', () => {
  it('is full from the first frame, before anything has ticked', () => {
    const trace = emfTrace(initialGeneratorState(P), P, 357);
    expect(trace).toHaveLength(357);
    expect(Math.max(...trace)).toBeGreaterThan(1.5);
  });

  it('ends at the EMF the sim gives for the wheel now', () => {
    const s = run(initialGeneratorState(P), 7);
    const trace = emfTrace(s, P, 300);
    expect(trace.at(-1)).toBeCloseTo(instantaneousEmfV(rotorAngleRad(s), rotorOmegaRadS(s), P), 12);
    expect(trace[0]).toBeCloseTo(instantaneousEmfV(angleAtRad(s, s.timeS - SCOPE_WINDOW_S), W0, P), 12);
  });

  it('shows four cycles at 8 rev/s, and eight at 16 rev/s', () => {
    const at8 = emfTrace(run(initialGeneratorState(P), 13), P, 2000);
    const at16 = emfTrace(setSpeed(run(initialGeneratorState(P), 13), 16, false), P, 2000);
    // Rising crossings in a half-second window: four or eight, give or take
    // the one the window's edges cut through.
    expect(risingCrossings(at8)).toBeGreaterThanOrEqual(3);
    expect(risingCrossings(at8)).toBeLessThanOrEqual(4);
    expect(risingCrossings(at16)).toBeGreaterThanOrEqual(7);
    expect(risingCrossings(at16)).toBeLessThanOrEqual(8);
  });

  it('peaks at 1.57 V at 8 rev/s and 3.14 V at 16 rev/s: the amplitude tracks the speed', () => {
    const peak = (s: GeneratorState) => Math.max(...emfTrace(s, P, 4000).map(Math.abs));
    // 4,000 samples over four to eight cycles land within 0.4° of each
    // crest, where the sine is within 3 × 10⁻⁵ of its peak.
    expect(peak(initialGeneratorState(P))).toBeCloseTo(Math.PI / 2, 3);
    expect(peak(setSpeed(initialGeneratorState(P), 16, false))).toBeCloseTo(Math.PI, 3);
  });

  it('is flat at rest', () => {
    const trace = emfTrace(setSpeed(initialGeneratorState(P), 0, false), P, 100);
    expect(trace.every((v) => v === 0)).toBe(true);
  });

  it('shows both speeds either side of a live change', () => {
    let s = run(initialGeneratorState(P), 30);
    s = run(setSpeed(s, 16, true), 15);
    const trace = emfTrace(s, P, 1001);
    // The newest quarter second is at 16 rev/s, the oldest at 8.
    const newest = Math.max(...trace.slice(500).map(Math.abs));
    const oldest = Math.max(...trace.slice(0, 480).map(Math.abs));
    expect(newest).toBeGreaterThan(3);
    expect(oldest).toBeLessThan(1.6);
  });

  it('always has at least two samples, so a line can be drawn', () => {
    expect(emfTrace(initialGeneratorState(P), P, 0)).toHaveLength(2);
  });
});

describe('generator: scales and readouts', () => {
  it('lets the slider run from rest to 16 rev/s, twice the regulated speed', () => {
    expect(speedMaxRevS(P)).toBe(16);
  });

  it('scales the scope to ±3.5 V, the 3.14 V peak at 16 rev/s rounded up', () => {
    expect(scopeScaleV(P)).toBe(3.5);
    expect(scopeGridV(3.5)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it('put a unit on every value, at 8 rev/s: 8 Hz, 1.57 V peak, 1.00 V rectified mean', () => {
    const values = readouts(initialGeneratorState(P), P).map((r) => r.value);
    expect(values).toEqual(['8.0 rev/s', '8.0 Hz', '1.57 V', '1.00 V', '1× real time']);
  });

  it('double with the speed', () => {
    const values = readouts(setSpeed(initialGeneratorState(P), 16, true), P).map((r) => r.value);
    expect(values.slice(0, 4)).toEqual(['16.0 rev/s', '16.0 Hz', '3.14 V', '2.00 V']);
  });

  it('read zero, not a negative zero, at rest', () => {
    const values = readouts(setSpeed(initialGeneratorState(P), 0, true), P).map((r) => r.value);
    expect(values.slice(0, 4)).toEqual(['0.0 rev/s', '0.0 Hz', '0.00 V', '0.00 V']);
  });

  it('say when slow motion is on', () => {
    const slow = readouts(setSlowMotion(initialGeneratorState(P), true), P);
    expect(slow.at(-1)?.value).toBe('1/8× real time');
  });

  it('announce the slider’s value with its unit', () => {
    expect(speedValueText(8)).toBe('8.0 rev/s');
  });
});

describe('generator: layout and geometry', () => {
  it('stacks the scope under the wheel in a 380 px phone’s 356 px column, inside the column', () => {
    const l = generatorLayout(356);
    expect(l.wide).toBe(false);
    expect(l.wheel.cx - l.wheel.radius).toBeGreaterThanOrEqual(0);
    expect(l.coil.y).toBeGreaterThanOrEqual(0);
    expect(l.coil.y + l.coil.height).toBeLessThan(l.wheel.cy - l.wheel.radius);
    expect(l.scope.y).toBeGreaterThan(l.wheel.cy + l.wheel.radius);
    expect(l.scope.x + l.scope.width).toBeLessThanOrEqual(356);
    expect(l.scope.y + l.scope.height).toBeLessThanOrEqual(l.height);
    // A cycle at 16 rev/s is 1/16 s of the half-second window: 20 px or more.
    expect(l.scope.width / 8).toBeGreaterThanOrEqual(20);
  });

  it('sets the scope beside the wheel on a desktop column, without overlapping it', () => {
    const l = generatorLayout(616);
    expect(l.wide).toBe(true);
    expect(l.wheel.cx + l.wheel.radius).toBeLessThan(l.scope.x);
    expect(l.scope.x + l.scope.width).toBeLessThanOrEqual(616);
    expect(l.wheel.cy + l.wheel.radius).toBeLessThanOrEqual(l.height);
    expect(l.scope.y + l.scope.height).toBeLessThanOrEqual(l.height);
  });

  it('switches layout at its breakpoint, and reports the height it needs', () => {
    expect(generatorLayout(WIDE_MIN_PX - 1).wide).toBe(false);
    expect(generatorLayout(WIDE_MIN_PX).wide).toBe(true);
    expect(heightForWidth(356)).toBe(generatorLayout(356).height);
  });

  it('draws nothing rather than negative sizes in a zero-width slot', () => {
    const l = generatorLayout(0);
    expect(l.wheel.radius).toBe(0);
    expect(l.scope.width).toBe(0);
  });

  it('maps the scope’s ends and zero where they belong, and clamps off-scale values', () => {
    const box = { x: 10, y: 20, width: 100, height: 60 };
    expect(scopePoint(box, 0, 11, 0, 3.5)).toEqual({ x: 10, y: 50 });
    expect(scopePoint(box, 10, 11, 3.5, 3.5)).toEqual({ x: 110, y: 20 });
    expect(scopePoint(box, 5, 11, -3.5, 3.5)).toEqual({ x: 60, y: 80 });
    expect(scopePoint(box, 5, 11, 99, 3.5).y).toBe(20);
  });
});
