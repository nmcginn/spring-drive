import { describe, expect, it } from 'vitest';
import {
  FRAME_BUDGET_MS,
  FRAME_WINDOW,
  createFrameRecorder,
  formatMs,
  quantile,
  summarize,
  type FrameSample,
} from '../../src/runtime/budget.ts';

const frame = (totalMs: number, widgets: Record<string, number> = { a: totalMs }): FrameSample => ({
  totalMs,
  widgets: new Map(Object.entries(widgets)),
});

describe('the frame budget', () => {
  it('is the 4 ms CLAUDE.md sets for all visible widgets together', () => {
    expect(FRAME_BUDGET_MS).toBe(4);
  });

  it('keeps four seconds of frames at 60 Hz', () => {
    expect(FRAME_WINDOW).toBe(240);
  });
});

describe('quantile', () => {
  it('returns one of the values by nearest rank, never an interpolation', () => {
    const values = [5, 1, 4, 2, 3];
    expect(quantile(values, 0.5)).toBe(3);
    expect(quantile(values, 0.95)).toBe(5);
    expect(quantile(values, 0)).toBe(1);
    expect(quantile(values, 1)).toBe(5);
  });

  it('takes the 95th percentile of 100 frames as the 95th slowest from the bottom', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(quantile(values, 0.95)).toBe(95);
  });

  it('is zero for no values, and leaves its input unsorted', () => {
    expect(quantile([], 0.95)).toBe(0);
    const values = [3, 1, 2];
    quantile(values, 0.5);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('summarize', () => {
  it('gives the mean, 95th percentile, worst, and share over budget of the frame totals', () => {
    const s = summarize([frame(1), frame(2), frame(3), frame(6)]);
    expect(s.frames).toBe(4);
    expect(s.meanMs).toBe(3);
    expect(s.p95Ms).toBe(6);
    expect(s.maxMs).toBe(6);
    expect(s.overBudget).toBe(0.25);
  });

  it('counts a frame exactly at the budget as within it', () => {
    expect(summarize([frame(FRAME_BUDGET_MS)]).overBudget).toBe(0);
  });

  it('averages each widget over the frames it ticked in, most expensive first', () => {
    const s = summarize([frame(3, { loop: 2, quartz: 1 }), frame(4, { loop: 4 })]);
    expect(s.widgets).toEqual([
      { name: 'loop', meanMs: 3, frames: 2 },
      { name: 'quartz', meanMs: 1, frames: 1 },
    ]);
  });

  it('is all zeros with no frames, rather than NaN', () => {
    expect(summarize([])).toEqual({ frames: 0, meanMs: 0, p95Ms: 0, maxMs: 0, overBudget: 0, widgets: [] });
  });
});

describe('the frame recorder', () => {
  it('keeps frames in order until it is full', () => {
    const r = createFrameRecorder(3);
    r.record(frame(1));
    r.record(frame(2));
    expect(r.samples().map((s) => s.totalMs)).toEqual([1, 2]);
  });

  it('keeps only the most recent frames once full, oldest first', () => {
    const r = createFrameRecorder(3);
    for (let i = 1; i <= 7; i++) r.record(frame(i));
    expect(r.samples().map((s) => s.totalMs)).toEqual([5, 6, 7]);
  });

  it('starts again from nothing when cleared', () => {
    const r = createFrameRecorder(3);
    for (let i = 1; i <= 5; i++) r.record(frame(i));
    r.clear();
    expect(r.samples()).toEqual([]);
    r.record(frame(9));
    expect(r.samples().map((s) => s.totalMs)).toEqual([9]);
  });
});

describe('formatMs', () => {
  it('writes a duration to two decimals with its unit', () => {
    expect(formatMs(1.234)).toBe('1.23 ms');
    expect(formatMs(0)).toBe('0.00 ms');
  });
});
