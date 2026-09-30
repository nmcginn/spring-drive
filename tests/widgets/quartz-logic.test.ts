import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS as P } from '../../src/sim/params.ts';
import { stageLevel } from '../../src/sim/quartz.ts';
import { UNIT_SPACE } from '../../src/widgets/shared/format.ts';
import {
  FORK_SHARP_MAX_HZ,
  INITIAL_SLOW_EXPONENT,
  MIN_HALF_PERIOD_PX,
  WIDE_MIN_PX,
  advanceQuartz,
  forkDrawing,
  heightForWidth,
  initialQuartzState,
  levelsNow,
  maxSlowExponent,
  onScreenHz,
  playbackRate,
  quartzLayout,
  readouts,
  rowCentreY,
  setSlowExponent,
  slowValueText,
  stageTrace,
  tickIntervalText,
  tickMarksX,
  windowCycles,
  windowStartText,
  type QuartzState,
} from '../../src/widgets/quartz/logic.ts';

const at = (cycles: number, slowExponent: number): QuartzState => ({ cycles, slowExponent });
const value = (state: QuartzState, label: string) => readouts(state, P).find((r) => r.label.startsWith(label))?.value;
/** The canvas is 324 px wide in the 380 px e2e project (the widget's card has its own padding), so the traces are 210 px. */
const PHONE_CANVAS_PX = 324;
const PHONE_TRACE_PX = quartzLayout(PHONE_CANVAS_PX, P).traces.width;

describe('quartz: the slow-down control', () => {
  it('opens slowed 64 times, in the middle of a slider that runs from real time to 1/4,096', () => {
    const s = initialQuartzState();
    expect(s.slowExponent).toBe(INITIAL_SLOW_EXPONENT);
    expect(playbackRate(s)).toBe(1 / 64);
    expect(maxSlowExponent(P)).toBe(12);
    expect(INITIAL_SLOW_EXPONENT * 2).toBe(maxSlowExponent(P));
  });

  it('at its slowest shows the crystal swinging at the reference’s own 8 Hz', () => {
    const slowest = at(0, maxSlowExponent(P));
    expect(onScreenHz(slowest, 0, P)).toBe(8);
    expect(onScreenHz(at(0, 0), P.referenceDividerStages, P)).toBe(8);
  });

  it('clamps and rounds what it is given to a whole power of two inside its range', () => {
    const s = initialQuartzState();
    expect(setSlowExponent(s, -3, P).slowExponent).toBe(0);
    expect(setSlowExponent(s, 99, P).slowExponent).toBe(12);
    expect(setSlowExponent(s, 7.4, P).slowExponent).toBe(7);
    expect(setSlowExponent(s, Number.NaN, P).slowExponent).toBe(INITIAL_SLOW_EXPONENT);
  });

  it('keeps the count where it was when the speed changes, so the traces do not jump', () => {
    const s = setSlowExponent(at(12_345.6, 3), 10, P);
    expect(s.cycles).toBe(12_345.6);
  });

  it('announces its value against real time', () => {
    expect(slowValueText(0)).toBe('real time');
    expect(slowValueText(6)).toBe('1/64 of real time');
    expect(slowValueText(12)).toBe('1/4,096 of real time');
  });
});

describe('quartz: advancing', () => {
  it('counts 32,768 cycles a second of page time at real time, and 64 times fewer at 1/64', () => {
    expect(advanceQuartz(at(0, 0), 1, P).cycles).toBe(32_768);
    expect(advanceQuartz(at(0, 6), 1, P).cycles).toBe(512);
    expect(advanceQuartz(at(0, 12), 0.5, P).cycles).toBe(4);
  });

  it('counts one reference tick per 4,096 cycles, eight a second at real time', () => {
    let s = at(0, 0);
    for (let i = 0; i < 60; i++) s = advanceQuartz(s, 1 / 60, P);
    // 60 frames of 1/60 s sum to 1 s give or take float rounding, which can
    // leave the count a hair under 32,768 and the eighth tick not yet given.
    expect(s.cycles).toBeCloseTo(32_768, 6);
    expect(value(advanceQuartz(at(0, 0), 1, P), 'Reference ticks given')).toBe(`8${UNIT_SPACE}ticks`);
  });

  it('treats a zero, negative, or non-finite frame gap as no time at all', () => {
    const s = at(100, 0);
    expect(advanceQuartz(s, 0, P).cycles).toBe(100);
    expect(advanceQuartz(s, -1, P).cycles).toBe(100);
    expect(advanceQuartz(s, Number.NaN, P).cycles).toBe(100);
    expect(advanceQuartz(s, Number.POSITIVE_INFINITY, P).cycles).toBe(100);
  });

  it('over an hour of frames, keeps the count within a hundredth of a cycle, and the ticks exactly the count over 4,096', () => {
    // The scheduler clamps frames to 0.1 s, so an hour is at least 36,000 steps.
    let s = at(0, 0);
    for (let i = 0; i < 36_000; i++) s = advanceQuartz(s, 0.1, P);
    // Each 0.1 s is 3,276.8 cycles, not exact in binary, so summing frames
    // rounds a little each step. That is the page's clock, not the model:
    // measured, the hour comes out 7 × 10⁻⁵ cycles short, and a hundredth
    // of a cycle is 140 times that. What the model promises is that the
    // reference is counted from the crystal, and that holds exactly.
    expect(Math.abs(s.cycles - 32_768 * 3600)).toBeLessThan(0.01);
    const ticks = Math.floor(s.cycles / 4096);
    expect(value(s, 'Reference ticks given')).toBe(`${ticks.toLocaleString('en-US')}${UNIT_SPACE}ticks`);
    expect(value(s, 'Counter')).toBe(`${(Math.floor(s.cycles) % 4096).toLocaleString('en-US')}${UNIT_SPACE}cycles`);
    // Just short of the hour's last tick, and just past the one before.
    expect(ticks).toBe(28_799);
  });
});

describe('quartz: the traces', () => {
  it('shows a whole second of page time, whatever the speed', () => {
    expect(windowCycles(at(0, 0), P)).toBe(32_768);
    expect(windowCycles(at(0, 12), P)).toBe(8);
  });

  it('draws at real time on a phone only the three slowest stages, 32, 16, and 8 Hz, and shades the rest', () => {
    const kinds = Array.from({ length: 13 }, (_, stage) => stageTrace(at(40_000, 0), stage, PHONE_TRACE_PX, P).kind);
    expect(kinds.slice(0, 10).every((k) => k === 'shaded')).toBe(true);
    expect(kinds.slice(10)).toEqual(['wave', 'wave', 'wave']);
  });

  it('draws the crystal itself at 1/4,096, as eight cycles across the window', () => {
    const trace = stageTrace(at(100, 12), 0, PHONE_TRACE_PX, P);
    expect(trace.kind).toBe('wave');
    if (trace.kind !== 'wave') return;
    // 8 cycles make 16 edges, plus the starting level.
    expect(trace.steps).toHaveLength(17);
  });

  it('never draws a level narrower than the legibility limit', () => {
    for (let e = 0; e <= 12; e++) {
      for (let stage = 0; stage <= 12; stage++) {
        const trace = stageTrace(at(12_345.678, e), stage, PHONE_TRACE_PX, P);
        if (trace.kind !== 'wave') continue;
        for (let i = 2; i < trace.steps.length; i++) {
          expect(trace.steps[i]!.x - trace.steps[i - 1]!.x).toBeGreaterThanOrEqual(MIN_HALF_PERIOD_PX - 1e-9);
        }
      }
    }
  });

  it('draws each wave with the levels the divider chain has at those moments, alternating at every edge', () => {
    const s = at(9_000.3, 6);
    const span = windowCycles(s, P);
    for (let stage = 0; stage <= 12; stage++) {
      const trace = stageTrace(s, stage, 1000, P);
      if (trace.kind !== 'wave') continue;
      trace.steps.forEach((step, i) => {
        const next = trace.steps[i + 1]?.x ?? 1000;
        // Check the level halfway along each step against the sim.
        const cycles = s.cycles - span + (((step.x + next) / 2) * span) / 1000;
        expect(step.level).toBe(stageLevel(cycles, stage));
        if (i > 0) expect(step.level).not.toBe(trace.steps[i - 1]!.level);
      });
    }
  });

  it('fills a window that reaches back before the widget opened, as if the crystal had always run', () => {
    const trace = stageTrace(at(0, 0), 12, PHONE_TRACE_PX, P);
    expect(trace.kind).toBe('wave');
    if (trace.kind !== 'wave') return;
    expect(trace.steps[0]!.x).toBe(0);
    // Eight reference periods in a second: 16 edges, the last one exactly now.
    expect(trace.steps).toHaveLength(17);
    expect(trace.steps.at(-1)!.x).toBeCloseTo(PHONE_TRACE_PX, 9);
  });

  it('marks the counter rolling over eight times a second at real time, evenly spaced', () => {
    const marks = tickMarksX(at(50_000, 0), 800, P);
    expect(marks).toHaveLength(8);
    for (let i = 1; i < marks.length; i++) expect(marks[i]! - marks[i - 1]!).toBeCloseTo(100, 9);
  });

  it('shows no tick mark when the window holds no rollover, as slowed 4,096 times it usually does not', () => {
    expect(tickMarksX(at(5000, 12), 800, P)).toEqual([]);
    expect(tickMarksX(at(4100, 12), 800, P)).toHaveLength(1);
  });

  it('lights each lamp with its stage’s level now, and leaves it unlit where the trace is shaded', () => {
    const s = at(4096 * 3 + 5.75, 0);
    const lamps = levelsNow(s, PHONE_TRACE_PX, P);
    expect(lamps.slice(0, 10).every((l) => l === null)).toBe(true);
    expect(lamps.slice(10)).toEqual([0, 0, 0]);
    const slow = levelsNow(at(5.75, 12), PHONE_TRACE_PX, P);
    // 5.75 cycles: oscillator high (second half), then the bits of 5 = 101.
    expect(slow.slice(0, 4)).toEqual([1, 1, 0, 1]);
  });
});

describe('quartz: the crystal', () => {
  it('swings the tines once per cycle, widest in the oscillator’s high half and closest in its low', () => {
    expect(forkDrawing(at(0.75, 12), P).spread).toBeCloseTo(1, 12);
    expect(forkDrawing(at(0.25, 12), P).spread).toBeCloseTo(-1, 12);
    expect(stageLevel(0.75, 0)).toBe(1);
    expect(stageLevel(0.25, 0)).toBe(0);
  });

  it('draws the swing only while it is slow enough to follow, and a blur faster than that', () => {
    expect(onScreenHz(at(0, 12), 0, P)).toBeLessThanOrEqual(FORK_SHARP_MAX_HZ);
    expect(forkDrawing(at(0, 12), P).blurred).toBe(false);
    for (let e = 0; e < 12; e++) expect(forkDrawing(at(0, e), P).blurred).toBe(true);
  });
});

describe('quartz: readouts', () => {
  it('opens reading the crystal and the reference as slowed 64 times, with units on every value', () => {
    expect(readouts(initialQuartzState(), P).map((r) => r.value)).toEqual([
      '1/64× real time',
      `512${UNIT_SPACE}Hz`,
      `8${UNIT_SPACE}s`,
      `0${UNIT_SPACE}cycles`,
      `0${UNIT_SPACE}ticks`,
    ]);
  });

  it('reads the crystal and the tick interval at both ends of the slider', () => {
    expect(value(at(0, 0), 'Crystal, on screen')).toBe(`32,768${UNIT_SPACE}Hz`);
    expect(value(at(0, 0), 'A reference tick every')).toBe(`0.125${UNIT_SPACE}s`);
    expect(value(at(0, 12), 'Crystal, on screen')).toBe(`8${UNIT_SPACE}Hz`);
    expect(value(at(0, 12), 'A reference tick every')).toBe(`8${UNIT_SPACE}min 32${UNIT_SPACE}s`);
    expect(value(at(0, 12), 'Playback')).toBe('1/4,096× real time');
  });

  it('gives the tick interval in seconds up to a minute and in minutes beyond', () => {
    const texts = Array.from({ length: 13 }, (_, e) => tickIntervalText(at(0, e), P));
    expect(texts.slice(0, 4)).toEqual([0.125, 0.25, 0.5, 1].map((s) => `${s.toFixed(s < 1 ? 3 : 0)}${UNIT_SPACE}s`));
    expect(texts[8]).toBe(`32${UNIT_SPACE}s`);
    expect(texts[9]).toBe(`1${UNIT_SPACE}min 04${UNIT_SPACE}s`);
  });

  it('reads the counter as the cycles since the last tick, rolling over at 4,096', () => {
    expect(readouts(at(0, 0), P)[3]!.label).toBe('Counter, 0 to 4,095');
    expect(value(at(4095.9, 0), 'Counter')).toBe(`4,095${UNIT_SPACE}cycles`);
    expect(value(at(4096, 0), 'Counter')).toBe(`0${UNIT_SPACE}cycles`);
    expect(value(at(4096, 0), 'Reference ticks given')).toBe(`1${UNIT_SPACE}ticks`);
  });

  it('labels the time axis with the window’s length in sim time', () => {
    expect(windowStartText(at(0, 0))).toBe(`−1.00${UNIT_SPACE}s`);
    expect(windowStartText(at(0, 6))).toBe(`−15.6${UNIT_SPACE}ms`);
    expect(windowStartText(at(0, 12))).toBe(`−244${UNIT_SPACE}µs`);
  });
});

describe('quartz: layout', () => {
  it('puts the crystal above the diagram on a phone and beside it on a wide column', () => {
    expect(quartzLayout(PHONE_CANVAS_PX, P).wide).toBe(false);
    expect(PHONE_TRACE_PX).toBe(210);
    expect(quartzLayout(WIDE_MIN_PX, P).wide).toBe(true);
    const narrow = quartzLayout(PHONE_CANVAS_PX, P);
    expect(narrow.fork.baseY + narrow.fork.tineWidth * 1.5).toBeLessThan(narrow.traces.top - 24);
    const wide = quartzLayout(700, P);
    expect(wide.fork.cx + wide.fork.gap + wide.fork.tineWidth * 2 + wide.fork.swing).toBeLessThan(wide.diagramLeft);
  });

  it('keeps the traces, labels, and lamps inside the canvas at 380 px and at desktop width', () => {
    for (const width of [PHONE_CANVAS_PX, 356, WIDE_MIN_PX, 700]) {
      const l = quartzLayout(width, P);
      expect(l.traces.width).toBeGreaterThan(200);
      expect(l.labelRight).toBeGreaterThan(l.diagramLeft + 50);
      expect(l.lampX + 5).toBeLessThanOrEqual(width);
      expect(rowCentreY(l, 12) + 6 + 22).toBeLessThanOrEqual(l.height);
      expect(heightForWidth(width, P)).toBe(l.height);
    }
  });

  it('gives each of the thirteen rows its own band, crystal at the top and reference at the bottom', () => {
    const l = quartzLayout(PHONE_CANVAS_PX, P);
    for (let stage = 1; stage <= 12; stage++) {
      expect(rowCentreY(l, stage) - rowCentreY(l, stage - 1)).toBe(l.traces.rowPitch);
    }
    expect(rowCentreY(l, 0)).toBeGreaterThan(l.traces.top);
  });

  it('draws nothing it cannot fit at zero width, rather than throwing', () => {
    expect(quartzLayout(0, P).traces.width).toBe(0);
    expect(stageTrace(at(0, 0), 12, 0, P).kind).toBe('shaded');
  });
});
