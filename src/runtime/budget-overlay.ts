// The frame budget, read on the page (decision 39). With `?budget` in the
// URL, a panel shows what the scheduler measured over the last few seconds:
// all widgets together per frame, and each widget alone. This is how the
// 4 ms budget is checked on a real reader's machine, which CI is not, and
// Playwright reads the same panel so the two can never measure different
// things. Without `?budget` none of this runs.

import { FRAME_BUDGET_MS, formatMs, type FrameCostSummary } from './budget.ts';
import { createButton } from './controls.ts';
import type { Scheduler } from './scheduler.ts';

/**
 * How often the panel refreshes, ms. Twice a second is readable; refreshing
 * every frame would add the panel's own layout to the frames it measures.
 */
export const OVERLAY_REFRESH_MS = 500;

/** Whether the page was opened with `?budget`. */
export function budgetRequested(search: string): boolean {
  return new URLSearchParams(search).has('budget');
}

/** The panel's rows, label then value, pure. */
export function overlayRows(summary: FrameCostSummary): [string, string][] {
  if (summary.frames === 0) return [['Frames', 'none: no widget is animating']];
  return [
    ['Frames', String(summary.frames)],
    ['Mean', formatMs(summary.meanMs)],
    ['95th percentile', formatMs(summary.p95Ms)],
    ['Worst', formatMs(summary.maxMs)],
    ['Over budget', `${(summary.overBudget * 100).toFixed(1)} %`],
    ...summary.widgets.map((w): [string, string] => [w.name, `${formatMs(w.meanMs)} mean`]),
  ];
}

export function mountBudgetOverlay(scheduler: Scheduler, parent: HTMLElement = document.body): () => void {
  const panel = document.createElement('aside');
  panel.className = 'budget-overlay';
  panel.setAttribute('aria-label', 'Frame budget');
  // A disclosure, so on a phone the panel folds away from the widget it is
  // measuring and still keeps measuring.
  const details = document.createElement('details');
  details.open = true;
  const heading = document.createElement('summary');
  heading.className = 'budget-overlay-title';
  heading.textContent = `Widget time per frame (budget ${formatMs(FRAME_BUDGET_MS)})`;
  const list = document.createElement('dl');
  list.className = 'readouts';
  // After scrolling to a new place, the window still holds frames from the
  // last one; this starts the measurement from here.
  const again = createButton({
    label: 'Measure again',
    ariaLabel: 'Measure the frame budget again from now',
    onPress: () => {
      scheduler.resetFrameCosts();
      refresh();
    },
  });
  details.append(heading, list, again);
  panel.append(details);
  parent.append(panel);

  function refresh(): void {
    const summary = scheduler.frameCosts();
    list.replaceChildren(
      ...overlayRows(summary).flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
    // Unrounded figures for Playwright, which asserts against the budget.
    panel.dataset.summary = JSON.stringify(summary);
  }

  refresh();
  const timer = setInterval(refresh, OVERLAY_REFRESH_MS);
  return () => {
    clearInterval(timer);
    panel.remove();
  };
}
