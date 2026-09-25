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

export async function ticks(page: Page): Promise<number> {
  return Number(await page.locator('.widget-placeholder').getAttribute('data-ticks'));
}

/** Wait for the browser to run `count` animation frames. */
export async function frames(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
  }, count);
}

/** Assert the placeholder is ticking: its counter advances within a few frames. */
export async function expectTicking(page: Page): Promise<void> {
  const start = await ticks(page);
  await expect.poll(() => ticks(page)).toBeGreaterThan(start + 2);
}

/**
 * Assert the placeholder is not ticking: its counter is unchanged across 20
 * frames. At 60 Hz that is a third of a second, a hundred times longer than
 * the scheduler takes to react to a change.
 */
export async function expectStill(page: Page): Promise<void> {
  const start = await ticks(page);
  await frames(page, 20);
  expect(await ticks(page)).toBe(start);
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
