import type { Page } from '@playwright/test';
import { THEMES } from '../../src/runtime/palette.ts';
import { expect, expectStill, expectTicking, frames, press, readout, test, ticks } from './fixtures.ts';

// Every widget is proven the same way: it mounts lazily, animates through the
// scheduler, stops offscreen, on global pause, and under reduced motion, and
// comes back from each. Then each widget's own primary control is exercised,
// and screenshots are written at both widths (the project name is in each
// file name) for review.

const HERO = '.widget-hero-glide';
const RUNAWAY = '.widget-runaway';

const WIDGETS = [
  { name: 'hero-glide', selector: HERO, playName: 'the two watches' },
  { name: 'runaway', selector: RUNAWAY, playName: 'the runaway glide wheel' },
] as const;

/** Bring a widget into view; lower widgets mount only as they near the viewport. */
async function show(page: Page, selector: string): Promise<void> {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await expect(page.locator(selector)).toBeInViewport();
}

/** Scroll to a widget's slot, which mounts it, then wait for the widget itself. */
async function reach(page: Page, name: string, selector: string): Promise<void> {
  await page.locator(`[data-widget="${name}"]`).scrollIntoViewIfNeeded();
  await expect(page.locator(selector)).toBeVisible();
  await show(page, selector);
}

async function open(page: Page, name: string, selector: string): Promise<void> {
  await page.goto('/');
  await reach(page, name, selector);
}

for (const w of WIDGETS) {
  test.describe(`${w.name}: runtime behaviour`, () => {
    test('mounts lazily and animates through the scheduler', async ({ page }) => {
      await open(page, w.name, w.selector);
      await expectTicking(page, w.selector);
    });

    test('stops ticking offscreen and resumes when scrolled back', async ({ page }) => {
      await open(page, w.name, w.selector);
      await expectTicking(page, w.selector);
      // The article is only stubs so far, too short to scroll every widget
      // out of view. Pad it at both ends, then scroll well past the widget.
      await page.evaluate(() => {
        const spacer = () => Object.assign(document.createElement('div'), { style: 'height: 4000px' });
        document.querySelector('main')?.append(spacer());
      });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator(w.selector)).not.toBeInViewport();
      await frames(page, 2); // let the IntersectionObserver report
      await expectStill(page, w.selector);

      await show(page, w.selector);
      await expectTicking(page, w.selector);
    });

    test('stops on global pause mid-animation, and resumes', async ({ page }) => {
      await open(page, w.name, w.selector);
      await expectTicking(page, w.selector);
      await press(page.getByRole('button', { name: 'Pause animations' }));
      await expectStill(page, w.selector);
      await press(page.getByRole('button', { name: 'Resume animations' }));
      await expectTicking(page, w.selector);
    });

    test('under reduced motion, shows a static frame and a Play button that starts it', async ({ page, snap }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, w.name, w.selector);
      await expectStill(page, w.selector);
      expect(await ticks(page, w.selector)).toBe(0);
      const play = page.getByRole('button', { name: `Play ${w.playName}` });
      await expect(play).toBeVisible();
      await snap(page, `${w.name}-reduced-motion`);

      await press(play);
      await expectTicking(page, w.selector);
      await press(page.getByRole('button', { name: `Pause ${w.playName}` }));
      await expectStill(page, w.selector);
    });

    test('mounts again after navigating away and back', async ({ page }) => {
      await open(page, w.name, w.selector);
      await expectTicking(page, w.selector);
      await page.goto('about:blank');
      await open(page, w.name, w.selector);
      await expectTicking(page, w.selector);
    });

    test('fits its column, with every readout inside the widget', async ({ page }) => {
      await open(page, w.name, w.selector);
      const box = await page.locator(w.selector).boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
      for (const dd of await page.locator(`${w.selector} .readouts dd`).all()) {
        const r = await dd.boundingBox();
        expect(r!.x + r!.width).toBeLessThanOrEqual(box!.x + box!.width);
      }
    });

    test('has a canvas backing store that matches its displayed size, so drawings are not stretched', async ({
      page,
    }) => {
      await open(page, w.name, w.selector);
      const canvas = page.locator(`${w.selector} canvas`);
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
      // One pixel of slack: the CSS width can be fractional, the backing
      // store cannot, and canvasSize floors before scaling.
      expect(Math.abs(m.pixelWidth - m.cssWidth * scale)).toBeLessThanOrEqual(scale);
      expect(Math.abs(m.pixelHeight - m.cssHeight * scale)).toBeLessThanOrEqual(scale);
    });
  });
}

test.describe('hero-glide', () => {
  test('glides a seconds hand at the regulated 8 rev/s beside a ticking one', async ({ page, snap }) => {
    await open(page, 'hero-glide', HERO);
    await expect(readout(page, HERO, 'Glide wheel speed')).toHaveText('8.000\u202frev/s');
    await expect(readout(page, HERO, 'Mechanical watch')).toHaveText('8\u202fbeats/s');
    await expect(readout(page, HERO, 'Mechanical hand steps')).toHaveText('0.75° a beat');
    await expect(readout(page, HERO, 'Playback')).toHaveText('1× real time');
    // Two seconds in, so both hands have left 12 and the loupes show marks.
    await expect.poll(() => ticks(page, HERO)).toBeGreaterThan(120);
    await snap(page, 'hero-glide');
  });

  test('slows to an eighth of real time from its primary control, and back', async ({ page, snap }) => {
    await open(page, 'hero-glide', HERO);
    const slow = page.getByRole('button', { name: 'Slow motion, one eighth of real time' });
    await expect(slow).toHaveAttribute('aria-pressed', 'false');
    await press(slow);
    await expect(slow).toHaveAttribute('aria-pressed', 'true');
    await expect(readout(page, HERO, 'Playback')).toHaveText('1/8× real time');
    await expectTicking(page, HERO);
    // The wheel still turns at 8 rev/s of sim time; only the page's clock slowed.
    await expect(readout(page, HERO, 'Glide wheel speed')).toHaveText('8.000\u202frev/s');
    await snap(page, 'hero-glide-slow-motion');
    await press(slow);
    await expect(readout(page, HERO, 'Playback')).toHaveText('1× real time');
  });

  test('follows the dark colour scheme', async ({ page, snap }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, 'hero-glide', HERO);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(THEMES.dark.ui.background.slice(i, i + 2), 16));
    expect(background).toBe(`rgb(${r}, ${g}, ${b})`);
    await expect.poll(() => ticks(page, HERO)).toBeGreaterThan(60);
    await snap(page, 'hero-glide-dark');
  });
});

test.describe('runaway', () => {
  test('waits, let down, until the reader winds it', async ({ page, snap }) => {
    await open(page, 'runaway', RUNAWAY);
    await expectTicking(page, RUNAWAY);
    await expect(readout(page, RUNAWAY, 'Glide wheel speed')).toHaveText('0.0\u202frev/s');
    await expect(readout(page, RUNAWAY, 'Mainspring wound')).toHaveText('0.0\u202f%');
    await snap(page, 'runaway-let-down');
  });

  test('winding from its primary control spins the wheel up well past 8 rev/s', async ({ page, snap }) => {
    await open(page, 'runaway', RUNAWAY);
    await press(page.getByRole('button', { name: 'Wind the mainspring fully and set the hands to 12:00' }));
    await expect(readout(page, RUNAWAY, 'Mainspring wound')).toHaveText(/^(100\.0|99\.9)\u202f%$/);
    // Unbraked at full wind the wheel settles at 30.61 rev/s (PHYSICS.md,
    // test 1) with a 0.625 s time constant, so within a few seconds of page
    // time it is past 30.
    const speed = async () => parseFloat((await readout(page, RUNAWAY, 'Glide wheel speed').textContent()) ?? '');
    await expect.poll(speed, { timeout: 10_000 }).toBeGreaterThan(30);
    expect(await speed()).toBeLessThan(31);
    await expect(readout(page, RUNAWAY, 'Hands run at')).toHaveText(/^3\.8\d× real time$/);
    await snap(page, 'runaway');
  });

  test('fast-forwards an hour a second, and back to real time', async ({ page, snap }) => {
    await open(page, 'runaway', RUNAWAY);
    await press(page.getByRole('button', { name: 'Wind the mainspring fully and set the hands to 12:00' }));
    const ff = page.getByRole('button', { name: 'Fast-forward, one hour each second' });
    await press(ff);
    await expect(ff).toHaveAttribute('aria-pressed', 'true');
    // Hours pass on the true-time readout within a couple of seconds.
    await expect(readout(page, RUNAWAY, 'True time')).toHaveText(/^\d+\u202fh \d\d\u202fmin$/, { timeout: 10_000 });
    await snap(page, 'runaway-fast-forward');
    await press(ff);
    await expect(ff).toHaveAttribute('aria-pressed', 'false');
    await expectTicking(page, RUNAWAY);
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

  test('has no horizontal scroll at its viewport width, with every widget mounted', async ({ page }) => {
    await page.goto('/');
    for (const w of WIDGETS) await reach(page, w.name, w.selector);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('stops on global pause, with a screenshot of the paused page', async ({ page, snap }) => {
    await open(page, 'hero-glide', HERO);
    await press(page.getByRole('button', { name: 'Pause animations' }));
    await expectStill(page, HERO);
    await snap(page, 'global-paused');
  });
});
