import { THEMES } from '../../src/runtime/palette.ts';
import { expect, expectStill, expectTicking, frames, press, test, ticks } from './fixtures.ts';

const widget = '.widget-placeholder';

test.describe('placeholder widget', () => {
  test('mounts lazily and animates through the scheduler', async ({ page, snap }) => {
    await page.goto('/');
    await expect(page.locator(widget)).toBeVisible();
    await expectTicking(page);
    await expect(page.locator(`${widget} .readouts dd`).first()).toHaveText(/^\d+\.\d\u202fs$/);
    await snap(page, 'placeholder');
  });

  test('stops ticking offscreen and resumes when scrolled back', async ({ page }) => {
    await page.goto('/');
    await expectTicking(page);
    // The article is only stubs so far, too short to scroll the widget out
    // of view. Pad it, then scroll well past the widget.
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '4000px';
      document.querySelector('main')?.append(spacer);
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator(widget)).not.toBeInViewport();
    await frames(page, 2); // let the IntersectionObserver report
    await expectStill(page);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(widget)).toBeInViewport();
    await expectTicking(page);
  });

  test('stops on global pause mid-animation, and resumes', async ({ page, snap }) => {
    await page.goto('/');
    await expectTicking(page);
    const pause = page.getByRole('button', { name: 'Pause animations' });
    await press(pause);
    await expectStill(page);
    await snap(page, 'global-paused');
    await press(page.getByRole('button', { name: 'Resume animations' }));
    await expectTicking(page);
  });

  test('resets its timer from its primary control', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => ticks(page)).toBeGreaterThan(30);
    await press(page.getByRole('button', { name: 'Pause animations' }));
    await press(page.getByRole('button', { name: 'Reset the placeholder timer' }));
    await expect(page.locator(`${widget} .readouts dd`).first()).toHaveText('0.0\u202fs');
  });

  test('under reduced motion, shows a static frame and a Play button that starts it', async ({ page, snap }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator(widget)).toBeVisible();
    await expectStill(page);
    expect(await ticks(page)).toBe(0);
    const play = page.getByRole('button', {
      name: 'Play placeholder animation',
    });
    await expect(play).toBeVisible();
    await snap(page, 'reduced-motion');

    await press(play);
    await expectTicking(page);
    await press(page.getByRole('button', { name: 'Pause placeholder animation' }));
    await expectStill(page);
  });

  test('follows the dark colour scheme', async ({ page, snap }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator(widget)).toBeVisible();
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(THEMES.dark.ui.background.slice(i, i + 2), 16));
    expect(background).toBe(`rgb(${r}, ${g}, ${b})`);
    await snap(page, 'placeholder-dark');
  });

  test('mounts again after navigating away and back', async ({ page }) => {
    await page.goto('/');
    await expectTicking(page);
    await page.goto('about:blank');
    await page.goto('/');
    await expectTicking(page);
  });
});

test.describe('page', () => {
  test('serves Jost from its own origin and makes no request to any other', async ({ page }) => {
    const fontRequests: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'font') fontRequests.push(r.url());
    });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('16px Jost'))).toBe(true);
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family.startsWith('Jost')).toBe(true);
    expect(fontRequests.length).toBeGreaterThan(0);
    for (const url of fontRequests) expect(new URL(url).pathname).toMatch(/^\/assets\/jost-.*\.woff2$/);
    // The guard fixture fails the test on any off-origin request.
  });

  test('the request guard itself fails a test that reaches another origin', async ({ page }) => {
    // Expected to fail: this proves the guard fixture is live, so the test
    // above passing means something. A stray font CDN link would trip it.
    test.fail();
    await page.goto('/');
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = 'https://example.invalid/pixel.png';
      document.body.append(img);
    });
    await expect.poll(() => page.evaluate(() => document.querySelector('img')?.complete)).toBe(true);
  });

  test('credits the project’s inspiration in a footnote', async ({ page, snap }) => {
    await page.goto('/');
    const credit = page.getByRole('link', { name: 'Mechanical Watch' });
    await expect(credit).toHaveAttribute('href', 'https://ciechanow.ski/mechanical-watch/');
    await credit.scrollIntoViewIfNeeded();
    await snap(page, 'footer');
  });

  test('colours prose part names from the palette', async ({ page }) => {
    await page.goto('/');
    const colour = await page.evaluate(() => {
      const span = document.createElement('span');
      span.className = 'part';
      span.dataset.part = 'rotor';
      document.body.append(span);
      return getComputedStyle(span).color;
    });
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(THEMES.light.parts.rotor.slice(i, i + 2), 16));
    expect(colour).toBe(`rgb(${r}, ${g}, ${b})`);
  });

  test('has no horizontal scroll at its viewport width', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(widget)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('canvas', () => {
  test('has a backing store that matches its displayed size, so drawings are not stretched', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator(`${widget} canvas`);
    await expect(canvas).toBeVisible();
    await frames(page, 2); // let the ResizeObserver settle
    const m = await canvas.evaluate((c: HTMLCanvasElement) => {
      const rect = c.getBoundingClientRect();
      return {
        pixelWidth: c.width,
        pixelHeight: c.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        dpr: devicePixelRatio,
      };
    });
    const scale = Math.min(m.dpr, 2);
    // One pixel of slack: the CSS width can be fractional, the backing store
    // cannot, and canvasSize floors before scaling.
    expect(Math.abs(m.pixelWidth - m.cssWidth * scale)).toBeLessThanOrEqual(scale);
    expect(Math.abs(m.pixelHeight - m.cssHeight * scale)).toBeLessThanOrEqual(scale);
  });
});
