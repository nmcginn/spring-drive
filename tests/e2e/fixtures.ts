import { join } from 'node:path';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

export const SCREENSHOT_DIR = join(import.meta.dirname, '..', '..', 'test-results', 'screenshots');

interface Fixtures {
  /** Fails the test on any console error, page error, or request to another origin. */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- Playwright's type for a fixture that provides no value.
  guard: void;
  snap: (page: Page, name: string) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  guard: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = [];
      const origin = new URL(baseURL ?? '').origin;
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
      });
      page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.protocol === 'data:' || url.protocol === 'blob:') return;
        if (url.origin !== origin) problems.push(`off-origin request: ${request.url()}`);
      });
      await use();
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the destructuring to resolve dependencies; this fixture has none.
  snap: async ({}, use, testInfo) => {
    await use(async (page, name) => {
      await page.screenshot({
        path: join(SCREENSHOT_DIR, `${name}-${testInfo.project.name}.png`),
        fullPage: false,
      });
    });
  },
});

export { expect };

/** Frames that have advanced the widget whose root matches `selector`. The shell keeps the count in `data-ticks`. */
export async function ticks(page: Page, selector: string): Promise<number> {
  return Number(await page.locator(selector).getAttribute('data-ticks'));
}

/** Wait for the browser to run `count` animation frames. */
export async function frames(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
  }, count);
}

/** Assert the widget is ticking: its counter advances within a few frames. */
export async function expectTicking(page: Page, selector: string): Promise<void> {
  const start = await ticks(page, selector);
  await expect.poll(() => ticks(page, selector)).toBeGreaterThan(start + 2);
}

/**
 * Assert the widget is not ticking: its counter is unchanged across 20
 * frames. At 60 Hz that is a third of a second, a hundred times longer than
 * the scheduler takes to react to a change.
 */
export async function expectStill(page: Page, selector: string): Promise<void> {
  const start = await ticks(page, selector);
  await frames(page, 20);
  expect(await ticks(page, selector)).toBe(start);
}

/** The value of the readout labelled `label` in the widget matching `selector`. */
export function readout(page: Page, selector: string, label: string): Locator {
  return page.locator(`${selector} .readouts dt`, { hasText: label }).locator('xpath=following-sibling::dd[1]');
}

/**
 * Press a control the way the current project's reader would: a tap on the
 * touch-enabled mobile project, a click on desktop.
 */
export async function press(locator: Locator): Promise<void> {
  const hasTouch = await locator.page().evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) await locator.tap();
  else await locator.click();
}
