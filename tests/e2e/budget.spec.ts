import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { FRAME_BUDGET_MS, type FrameCostSummary } from '../../src/runtime/budget.ts';
import { BUDGET_REPORT, expect, frames, press, pressAt, test } from './fixtures.ts';
import { mainThreadCost, type MainThreadCost, type TraceEvent } from './trace.ts';

// The frame budget (CLAUDE.md, priority 2; decision 39): all visible widgets
// together spend under 4 ms of main-thread time per frame. The page measures
// itself: with `?budget`, the scheduler times every tick and a panel shows
// the last few seconds, which is also how the maintainer checks it on a real
// laptop. This spec stops at each widget as a reader would, centred in the
// viewport with its neighbours partly in view, in the state its controls make
// most expensive, and asserts the panel's figures. It runs in projects of its
// own, after every other test and one at a time (playwright.config.ts), so no
// other browser is competing for the CPU while it measures.

/** Frames measured at each stop: two seconds at 60 Hz. */
const MEASURED_FRAMES = 120;

interface Stop {
  name: string;
  widget: string;
  /** Put the widget in its most expensive state. */
  setUp?: (page: Page) => Promise<void>;
}

const STOPS: Stop[] = [
  { name: 'hero-glide', widget: 'hero-glide' },
  {
    name: 'runaway, wound and spinning at full speed',
    widget: 'runaway',
    setUp: (page) => press(page.getByRole('button', { name: 'Wind the mainspring fully and set the hands to 12:00' })),
  },
  {
    name: 'runaway, fast-forwarded an hour a second',
    widget: 'runaway',
    setUp: async (page) => {
      await press(page.getByRole('button', { name: 'Wind the mainspring fully and set the hands to 12:00' }));
      await press(page.getByRole('button', { name: 'Fast-forward, 1 h/s: one hour each second' }));
    },
  },
  {
    name: 'generator at 16 rev/s, its densest trace',
    widget: 'generator',
    setUp: (page) => pressAt(page.getByRole('slider', { name: 'Glide wheel speed' }), 0.99),
  },
  {
    name: 'lenz-brake, let go',
    widget: 'lenz-brake',
    setUp: (page) => press(page.getByRole('button', { name: 'Let go at 8 rev/s: release the glide wheel' })),
  },
  { name: 'quartz', widget: 'quartz' },
  {
    name: 'loop, with regulation off and the wheel running away',
    widget: 'loop',
    setUp: (page) =>
      press(
        page.getByRole('button', {
          name: 'Regulation: the IC brakes the glide wheel to hold it on the reference',
        }),
      ),
  },
  {
    name: 'tri-synchro at two hours a second, its fastest',
    widget: 'tri-synchro',
    setUp: (page) => pressAt(page.getByRole('slider', { name: 'Time runs at' }), 0.99),
  },
];

async function summary(page: Page): Promise<FrameCostSummary> {
  const json = await page.locator('.budget-overlay').getAttribute('data-summary');
  return JSON.parse(json ?? '{}') as FrameCostSummary;
}

/**
 * Trace the page's main thread over `count` frames. Measured in a window of
 * its own, after the scheduler's, because tracing slows the page it watches.
 */
async function traceFrames(browser: Browser, page: Page, count: number): Promise<MainThreadCost> {
  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink'],
  });
  await frames(page, count);
  const buffer = await browser.stopTracing();
  const { traceEvents } = JSON.parse(buffer.toString()) as { traceEvents: TraceEvent[] };
  return mainThreadCost(traceEvents);
}

for (const stop of STOPS) {
  test(`stays under ${FRAME_BUDGET_MS} ms a frame at ${stop.name}`, async ({ page, browser }, testInfo) => {
    await page.goto('/?budget');
    const slot = page.locator(`[data-widget="${stop.widget}"]`);
    await slot.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(page.locator(`.widget-${stop.widget}`)).toBeInViewport();
    await stop.setUp?.(page);
    // Let lazy chunks, fonts, and the first frames' allocations settle.
    await frames(page, 30);

    // The widgets' own time, as the page measures it on any machine.
    await page.getByRole('button', { name: 'Measure again: the frame budget from now' }).click();
    await frames(page, MEASURED_FRAMES);
    await expect.poll(async () => (await summary(page)).frames).toBeGreaterThanOrEqual(MEASURED_FRAMES);
    const s = await summary(page);

    // Everything else the main thread does for those frames: style, layout,
    // paint, and, in a browser without a GPU, rasterising the canvases.
    const main = await traceFrames(browser, page, MEASURED_FRAMES);

    const report = {
      widgetsMeanMs: s.meanMs,
      widgetsP95Ms: s.p95Ms,
      widgets: s.widgets.map((w) => `${w.name} ${w.meanMs.toFixed(2)} ms`),
      mainThreadMs: main.busyMs,
      canvasRasterMs: main.canvasRasterMs,
    };
    testInfo.annotations.push({ type: 'frame budget', description: JSON.stringify(report) });
    // A table row for CI's run summary, so the figures reach the PR.
    const ms = (v: number) => v.toFixed(2);
    mkdirSync(dirname(BUDGET_REPORT), { recursive: true });
    appendFileSync(
      BUDGET_REPORT,
      `| ${testInfo.project.name} | ${stop.name} | ${ms(s.meanMs)} | ${ms(s.p95Ms)} | ${report.widgets.join(', ')} | ` +
        `${ms(main.busyMs)} | ${ms(main.canvasRasterMs)} | ${ms(main.busyMs - main.canvasRasterMs)} |\n`,
    );

    expect(s.frames).toBeGreaterThanOrEqual(MEASURED_FRAMES);
    expect(main.frames).toBeGreaterThanOrEqual(MEASURED_FRAMES);
    // The widgets' ticks: their sim, their drawing calls, their readouts.
    expect(s.meanMs).toBeLessThan(FRAME_BUDGET_MS);
    // The whole main thread, less the canvas rasterising a GPU would take
    // off it on a reader's machine; decision 39 says why that is set aside,
    // and what it leaves unproven.
    expect(main.busyMs - main.canvasRasterMs).toBeLessThan(FRAME_BUDGET_MS);
  });
}
