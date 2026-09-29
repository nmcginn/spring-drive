// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarize, type FrameCostSummary } from '../../src/runtime/budget.ts';
import {
  OVERLAY_REFRESH_MS,
  budgetRequested,
  mountBudgetOverlay,
  overlayRows,
} from '../../src/runtime/budget-overlay.ts';
import { createScheduler } from '../../src/runtime/scheduler.ts';
import { FakeEnv, fakeElement } from './fake-env.ts';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('budgetRequested', () => {
  it('is on only when the URL asks for it, with or without a value', () => {
    expect(budgetRequested('?budget')).toBe(true);
    expect(budgetRequested('?budget=1')).toBe(true);
    expect(budgetRequested('?a=1&budget')).toBe(true);
    expect(budgetRequested('')).toBe(false);
    expect(budgetRequested('?budgets')).toBe(false);
  });
});

describe('overlayRows', () => {
  it('says plainly when nothing is animating, rather than showing zeros', () => {
    expect(overlayRows(summarize([]))).toEqual([['Frames', 'none: no widget is animating']]);
  });

  it('gives every figure its unit, and each widget’s mean after the totals', () => {
    const summary: FrameCostSummary = summarize([
      { totalMs: 1.5, widgets: new Map([['loop', 1.5]]) },
      {
        totalMs: 5,
        widgets: new Map([
          ['loop', 3],
          ['quartz', 2],
        ]),
      },
    ]);
    expect(overlayRows(summary)).toEqual([
      ['Frames', '2'],
      ['Mean', '3.25 ms'],
      ['95th percentile', '5.00 ms'],
      ['Worst', '5.00 ms'],
      ['Over budget', '50.0 %'],
      ['loop', '2.25 ms mean'],
      ['quartz', '2.00 ms mean'],
    ]);
  });
});

describe('mountBudgetOverlay', () => {
  function setup() {
    vi.useFakeTimers();
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const el = fakeElement();
    scheduler.register(el, {
      name: 'loop',
      tick: () => {
        env.clockMs += 1.25;
      },
    });
    env.setVisible(el, true);
    return { env, scheduler };
  }

  it('shows the scheduler’s figures, refreshed twice a second, and its data for the tests', () => {
    const { env, scheduler } = setup();
    mountBudgetOverlay(scheduler);
    const panel = document.querySelector<HTMLElement>('.budget-overlay');
    expect(panel?.getAttribute('aria-label')).toBe('Frame budget');
    expect(panel?.textContent).toContain('budget 4.00 ms');
    expect(panel?.textContent).toContain('none: no widget is animating');

    env.frames(0, 10, 1000 / 60);
    vi.advanceTimersByTime(OVERLAY_REFRESH_MS);
    expect(panel?.textContent).toContain('1.25 ms');
    const data = JSON.parse(panel?.dataset.summary ?? '{}') as FrameCostSummary;
    expect(data.frames).toBe(10);
    expect(data.meanMs).toBe(1.25);
  });

  it('measures again from now when its button is pressed', () => {
    const { env, scheduler } = setup();
    mountBudgetOverlay(scheduler);
    env.frames(0, 10, 1000 / 60);
    const again = document.querySelector<HTMLButtonElement>('.budget-overlay button');
    expect(again?.getAttribute('aria-label')).toBe('Measure the frame budget again from now');
    again?.click();
    expect(scheduler.frameCosts().frames).toBe(0);
    expect(document.querySelector('.budget-overlay')?.textContent).toContain('none: no widget is animating');
  });

  it('opens unfolded, and folds away under its title', () => {
    const { scheduler } = setup();
    mountBudgetOverlay(scheduler);
    const details = document.querySelector<HTMLDetailsElement>('.budget-overlay details');
    expect(details?.open).toBe(true);
    expect(details?.querySelector('summary')?.textContent).toBe('Widget time per frame (budget 4.00 ms)');
  });

  it('removes its panel and stops refreshing when unmounted', () => {
    const { scheduler } = setup();
    const unmount = mountBudgetOverlay(scheduler);
    const spy = vi.spyOn(scheduler, 'frameCosts');
    unmount();
    expect(document.querySelector('.budget-overlay')).toBeNull();
    vi.advanceTimersByTime(OVERLAY_REFRESH_MS * 4);
    expect(spy).not.toHaveBeenCalled();
  });
});
