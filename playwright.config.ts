import { defineConfig } from '@playwright/test';

// Cloud sessions ship a Chromium that `playwright install` must not replace,
// and its revision can differ from the one @playwright/test pins. The
// session-start hook exports its path; CI leaves it unset and installs the
// pinned browser as usual (decision 11).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

const PORT = 4173;

const MOBILE = {
  viewport: { width: 380, height: 800 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
};
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const BUDGET = 'budget.spec.ts';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // Playwright's own output goes to test-results/playwright; screenshots are
  // written by the tests to test-results/screenshots, the path CI uploads.
  outputDir: 'test-results/playwright',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: MOBILE, testIgnore: BUDGET },
    { name: 'desktop', use: DESKTOP, testIgnore: BUDGET },
    // The frame budget is measured with nothing else running: after every
    // other test, and one width after the other (decision 39).
    { name: 'budget-mobile', use: MOBILE, testMatch: BUDGET, dependencies: ['mobile', 'desktop'] },
    { name: 'budget-desktop', use: DESKTOP, testMatch: BUDGET, dependencies: ['budget-mobile'] },
  ],
  // Tests run against the production build, which is what readers get, and
  // what proves the fonts are served from dist rather than fetched.
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse: a preview left running from an older build would test
    // yesterday's page.
    reuseExistingServer: false,
  },
});
