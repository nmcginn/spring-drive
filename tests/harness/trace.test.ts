import { describe, expect, it } from 'vitest';
import { mainThreadCost, unionUs, type TraceEvent } from '../e2e/trace.ts';

// The e2e frame-budget test (tests/e2e/budget.spec.ts) asserts on what this
// reads from Chrome's trace, so it is checked here on traces written by hand.

const MAIN = { pid: 1, tid: 10 };
const OTHER_MAIN = { pid: 2, tid: 20 };
const COMPOSITOR = { pid: 1, tid: 11 };

const meta = (t: { pid: number; tid: number }, name: string): TraceEvent => ({
  name: 'thread_name',
  ph: 'M',
  ts: 0,
  ...t,
  args: { name },
});
const task = (t: { pid: number; tid: number }, name: string, ts: number, dur: number): TraceEvent => ({
  name,
  ph: 'X',
  ts,
  dur,
  ...t,
});
const frameFired = (t: { pid: number; tid: number }, ts: number): TraceEvent => task(t, 'FireAnimationFrame', ts, 10);

describe('unionUs', () => {
  it('counts overlapping and nested intervals once', () => {
    expect(
      unionUs([
        [0, 10],
        [5, 15],
        [20, 30],
        [22, 25],
      ]),
    ).toBe(25);
  });

  it('is zero for no intervals', () => {
    expect(unionUs([])).toBe(0);
  });
});

describe('mainThreadCost', () => {
  const RASTER = 'CanvasResourceProviderSharedImage::ProduceCanvasResource';
  const events: TraceEvent[] = [
    meta(MAIN, 'CrRendererMain'),
    meta(OTHER_MAIN, 'CrRendererMain'),
    meta(COMPOSITOR, 'Compositor'),
    // Two frames on the page's main thread: tasks of 3 ms and 5 ms, a nested
    // task inside the second that must not count twice, and 1 ms and 2 ms of
    // canvas raster inside them.
    frameFired(MAIN, 0),
    task(MAIN, 'RunTask', 0, 3000),
    task(MAIN, RASTER, 500, 1000),
    frameFired(MAIN, 16_000),
    task(MAIN, 'RunTask', 16_000, 5000),
    task(MAIN, 'RunTask', 17_000, 1000),
    task(MAIN, RASTER, 18_000, 2000),
    // Another renderer's main thread, with no frames: a blank tab.
    task(OTHER_MAIN, 'RunTask', 0, 50_000),
    // Work on another thread of the page's renderer is not the main thread's.
    task(COMPOSITOR, 'RunTask', 0, 50_000),
    task(COMPOSITOR, RASTER, 0, 50_000),
  ];

  it('counts the frames the page’s main thread fired', () => {
    expect(mainThreadCost(events).frames).toBe(2);
  });

  it('gives the main thread’s busy time per frame, counting nested tasks once', () => {
    expect(mainThreadCost(events).busyMs).toBe(4);
  });

  it('gives the canvas rasterising within it per frame', () => {
    expect(mainThreadCost(events).canvasRasterMs).toBe(1.5);
  });

  it('reads nothing, rather than dividing by zero, from a trace with no frames', () => {
    expect(mainThreadCost([meta(MAIN, 'CrRendererMain'), task(MAIN, 'RunTask', 0, 1000)])).toEqual({
      frames: 0,
      busyMs: 0,
      canvasRasterMs: 0,
    });
  });
});
