// The frame budget (CLAUDE.md, priority 2): all visible widgets together
// spend under 4 ms of main-thread time per frame. The scheduler times every
// tick it runs and keeps the last few seconds here, so the budget can be read
// on the page itself (`?budget`, decision 39) and asserted by Playwright from
// the same numbers. Pure: the scheduler hands in the durations.

/** All visible widgets together, per frame, ms (CLAUDE.md). */
export const FRAME_BUDGET_MS = 4;

/**
 * Frames kept: four seconds at 60 Hz. Long enough that a mean and a 95th
 * percentile are steady from one reading to the next, short enough that a
 * reader scrolling to a new widget sees its cost within a few seconds.
 */
export const FRAME_WINDOW = 240;

/** One frame: its total, and what each widget that ticked spent, ms. */
export interface FrameSample {
  totalMs: number;
  widgets: ReadonlyMap<string, number>;
}

export interface WidgetCost {
  name: string;
  /** Mean over the frames this widget ticked in, ms. */
  meanMs: number;
  /** Frames in the window this widget ticked in. */
  frames: number;
}

export interface FrameCostSummary {
  frames: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  /** Share of frames over FRAME_BUDGET_MS, 0 to 1. */
  overBudget: number;
  /** Most expensive first. */
  widgets: readonly WidgetCost[];
}

/**
 * The value at quantile `q` (0 to 1) of `values`, by nearest rank: always one
 * of the values, never an interpolation between two, so a p95 of 3.1 ms means
 * some frame really took 3.1 ms.
 */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(q * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? 0;
}

export function summarize(samples: readonly FrameSample[], budgetMs: number = FRAME_BUDGET_MS): FrameCostSummary {
  const totals = samples.map((s) => s.totalMs);
  const byWidget = new Map<string, { sumMs: number; frames: number }>();
  for (const sample of samples) {
    for (const [name, ms] of sample.widgets) {
      const entry = byWidget.get(name) ?? { sumMs: 0, frames: 0 };
      entry.sumMs += ms;
      entry.frames += 1;
      byWidget.set(name, entry);
    }
  }
  const n = samples.length;
  return {
    frames: n,
    meanMs: n === 0 ? 0 : totals.reduce((a, b) => a + b, 0) / n,
    p95Ms: quantile(totals, 0.95),
    maxMs: n === 0 ? 0 : Math.max(...totals),
    overBudget: n === 0 ? 0 : totals.filter((t) => t > budgetMs).length / n,
    widgets: [...byWidget]
      .map(([name, { sumMs, frames }]) => ({ name, meanMs: sumMs / frames, frames }))
      .sort((a, b) => b.meanMs - a.meanMs),
  };
}

/** A ring of the last `capacity` frames. */
export interface FrameRecorder {
  record(sample: FrameSample): void;
  samples(): FrameSample[];
  clear(): void;
}

export function createFrameRecorder(capacity: number = FRAME_WINDOW): FrameRecorder {
  const ring: FrameSample[] = [];
  let next = 0;
  return {
    record(sample) {
      if (ring.length < capacity) ring.push(sample);
      else ring[next] = sample;
      next = (next + 1) % capacity;
    },
    // Oldest first, so a reader of the window sees frames in order.
    samples: () => (ring.length < capacity ? [...ring] : [...ring.slice(next), ...ring.slice(0, next)]),
    clear() {
      ring.length = 0;
      next = 0;
    },
  };
}

/**
 * A duration for the overlay, to two decimals. A browser coarsens
 * performance.now to 0.1 ms or so, but a mean over hundreds of frames
 * resolves finer than any one reading.
 */
export function formatMs(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}
