// Reading a Chrome performance trace for the frame budget (decision 39): how
// long the page's main thread was busy per frame, and how much of that was
// rasterising canvases. Pure, so tests/harness/trace.test.ts checks it on
// hand-written traces.

/** The fields of a Chrome trace event this reads. */
export interface TraceEvent {
  name: string;
  ph: string;
  pid: number;
  tid: number;
  /** Start, µs. */
  ts: number;
  /** Duration of a complete ('X') event, µs. */
  dur?: number;
  args?: { name?: string };
}

export interface MainThreadCost {
  /** Animation frames fired on the page's main thread. */
  frames: number;
  /** Everything the main thread ran, per frame, ms. */
  busyMs: number;
  /** Of that, rasterising and handing off canvases, per frame, ms. */
  canvasRasterMs: number;
}

/**
 * Canvas rasterisation. In a browser with no GPU, as in CI, a 2D canvas is
 * drawn in software on the main thread when its frame is produced; with a
 * GPU, as on a reader's laptop, the same work is replayed in the GPU process.
 */
const CANVAS_RASTER = /^CanvasResourceProvider.*::ProduceCanvasResource$/;

/** Total length of a set of intervals, counting overlaps once, µs. */
export function unionUs(intervals: readonly [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -Infinity;
  for (const [start, stop] of sorted) {
    if (stop <= end) continue;
    total += stop - Math.max(start, end);
    end = stop;
  }
  return total;
}

export function mainThreadCost(events: readonly TraceEvent[]): MainThreadCost {
  const key = (e: TraceEvent) => `${e.pid}:${e.tid}`;
  const mains = new Set(
    events.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map(key),
  );
  // The page's main thread is the renderer main that fired its frames; any
  // other renderer (a blank tab) fires none.
  const frameCounts = new Map<string, number>();
  for (const e of events) {
    if (e.name === 'FireAnimationFrame' && mains.has(key(e)))
      frameCounts.set(key(e), (frameCounts.get(key(e)) ?? 0) + 1);
  }
  const [thread, frames] = [...frameCounts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const on = events.filter((e) => key(e) === thread && e.ph === 'X' && e.dur !== undefined);
  const span = (e: TraceEvent): [number, number] => [e.ts, e.ts + (e.dur ?? 0)];
  const busyUs = unionUs(on.filter((e) => e.name === 'RunTask').map(span));
  const rasterUs = unionUs(on.filter((e) => CANVAS_RASTER.test(e.name)).map(span));
  const perFrameMs = (us: number) => (frames === 0 ? 0 : us / 1000 / frames);
  return { frames, busyMs: perFrameMs(busyUs), canvasRasterMs: perFrameMs(rasterUs) };
}
