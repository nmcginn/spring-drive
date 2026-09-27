import type { Page } from '@playwright/test';
import { THEMES } from '../../src/runtime/palette.ts';
import { expect, expectStill, expectTicking, frames, press, pressAt, readout, test, ticks } from './fixtures.ts';

// Every widget is proven the same way: it mounts lazily, animates through the
// scheduler, stops offscreen, on global pause, and under reduced motion, and
// comes back from each. Then each widget's own primary control is exercised,
// and screenshots are written at both widths (the project name is in each
// file name) for review.

const HERO = '.widget-hero-glide';
const RUNAWAY = '.widget-runaway';
const GENERATOR = '.widget-generator';
const LENZ = '.widget-lenz-brake';
const QUARTZ = '.widget-quartz';
const LOOP = '.widget-loop';

const WIDGETS = [
  { name: 'hero-glide', selector: HERO, playName: 'the two watches' },
  { name: 'runaway', selector: RUNAWAY, playName: 'the runaway glide wheel' },
  { name: 'generator', selector: GENERATOR, playName: 'the generator' },
  { name: 'lenz-brake', selector: LENZ, playName: 'the coil brake' },
  { name: 'quartz', selector: QUARTZ, playName: 'the quartz divider' },
  { name: 'loop', selector: LOOP, playName: 'the regulating loop' },
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
    // test 1). It has a 0.625 s time constant, but charging the capacitor
    // slows the last of the approach (D12), so it is past 29 about 4 s in and
    // near 30.6 only after 15 s. The hands run 3.63× to 3.83× real time over
    // that stretch.
    const speed = async () => parseFloat((await readout(page, RUNAWAY, 'Glide wheel speed').textContent()) ?? '');
    await expect.poll(speed, { timeout: 10_000 }).toBeGreaterThan(29);
    expect(await speed()).toBeLessThan(31);
    await expect(readout(page, RUNAWAY, 'Hands run at')).toHaveText(/^3\.[678]\d× real time$/);
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

test.describe('generator', () => {
  const speed = (page: Page) => page.getByRole('slider', { name: 'Glide wheel speed' });
  const value = async (page: Page, label: string) =>
    parseFloat((await readout(page, GENERATOR, label).textContent()) ?? '');

  test('opens at 8 rev/s, with the EMF readouts the model gives there', async ({ page, snap }) => {
    await open(page, 'generator', GENERATOR);
    await expect(readout(page, GENERATOR, 'Glide wheel speed')).toHaveText('8.0\u202frev/s');
    await expect(readout(page, GENERATOR, 'EMF frequency')).toHaveText('8.0\u202fHz');
    // PHYSICS.md, D9: a sine whose rectified mean is D4's 1.0 V peaks at π/2 V.
    await expect(readout(page, GENERATOR, 'Peak EMF')).toHaveText('1.57\u202fV');
    await expect(readout(page, GENERATOR, 'Rectified mean EMF')).toHaveText('1.00\u202fV');
    await expect(speed(page)).toHaveAttribute('aria-valuetext', '8.0\u202frev/s');
    await expect.poll(() => ticks(page, GENERATOR)).toBeGreaterThan(30);
    await snap(page, 'generator');
  });

  test('tapping or clicking the speed slider, its primary control, sets the speed and the EMF follows', async ({
    page,
    snap,
  }) => {
    await open(page, 'generator', GENERATOR);
    await pressAt(speed(page), 0.97);
    // Near the top of the 0 to 16 rev/s slider; the thumb's own width keeps
    // the value a little short of where the tap lands.
    await expect.poll(() => value(page, 'Glide wheel speed')).toBeGreaterThan(14);
    const revS = await value(page, 'Glide wheel speed');
    // Everything is proportional to speed: 1 Hz, π/16 V peak, and 1/8 V mean per rev/s.
    expect(await value(page, 'EMF frequency')).toBeCloseTo(revS, 1);
    expect(await value(page, 'Peak EMF')).toBeCloseTo((Math.PI / 16) * revS, 1);
    expect(await value(page, 'Rectified mean EMF')).toBeCloseTo(revS / 8, 1);
    await expectTicking(page, GENERATOR);
    // Let the new speed fill the half-second scope before the screenshot.
    await frames(page, 40);
    await snap(page, 'generator-fast');

    await pressAt(speed(page), 0.2);
    await expect.poll(() => value(page, 'Glide wheel speed')).toBeLessThan(5);
    await frames(page, 40);
    await snap(page, 'generator-slow');
  });

  test('steps with the arrow keys, 0.1 rev/s at a time', async ({ page }) => {
    await open(page, 'generator', GENERATOR);
    await speed(page).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(readout(page, GENERATOR, 'Glide wheel speed')).toHaveText('7.9\u202frev/s');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(readout(page, GENERATOR, 'Glide wheel speed')).toHaveText('8.1\u202frev/s');
  });

  test('under reduced motion, redraws the still frame at a new speed', async ({ page, snap }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'generator', GENERATOR);
    await pressAt(speed(page), 0.97);
    await expect.poll(() => value(page, 'Glide wheel speed')).toBeGreaterThan(14);
    await expectStill(page, GENERATOR);
    await snap(page, 'generator-reduced-motion-fast');
  });

  test('slows to an eighth of real time, and back', async ({ page, snap }) => {
    await open(page, 'generator', GENERATOR);
    const slow = page.getByRole('button', { name: 'Slow motion for the generator, one eighth of real time' });
    await press(slow);
    await expect(slow).toHaveAttribute('aria-pressed', 'true');
    await expect(readout(page, GENERATOR, 'Playback')).toHaveText('1/8× real time');
    await expectTicking(page, GENERATOR);
    await snap(page, 'generator-slow-motion');
    await press(slow);
    await expect(readout(page, GENERATOR, 'Playback')).toHaveText('1× real time');
  });

  test('follows the dark colour scheme', async ({ page, snap }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, 'generator', GENERATOR);
    await expect.poll(() => ticks(page, GENERATOR)).toBeGreaterThan(30);
    await snap(page, 'generator-dark');
  });
});

test.describe('lenz-brake', () => {
  const load = (page: Page) => page.getByRole('slider', { name: 'Coil shorted' });
  const letGo = (page: Page) => page.getByRole('button', { name: 'Let the glide wheel go from 8 rev/s' });
  const value = async (page: Page, label: string) => parseFloat((await readout(page, LENZ, label).textContent()) ?? '');
  /** Wait until the wheel has stopped: the speed reads zero. */
  const stopped = (page: Page) =>
    expect(readout(page, LENZ, 'Glide wheel speed')).toHaveText('0.00\u202frev/s', { timeout: 10_000 });

  test('opens held at 8 rev/s, with the torques the model gives there a quarter of the time shorted', async ({
    page,
    snap,
  }) => {
    await open(page, 'lenz-brake', LENZ);
    await expect(readout(page, LENZ, 'Glide wheel speed')).toHaveText('8.00\u202frev/s');
    await expect(readout(page, LENZ, 'Coil shorted')).toHaveText('25\u202f%');
    // PHYSICS.md, D4 and D10: a quarter of 198.9 nN·m, against 9.5 nN·m of friction.
    await expect(readout(page, LENZ, 'Brake torque')).toHaveText('49.7\u202fnN·m');
    await expect(readout(page, LENZ, 'Friction torque')).toHaveText('9.5\u202fnN·m');
    await expect(readout(page, LENZ, 'Mean coil current')).toHaveText('2.03\u202fµA');
    await expect(load(page)).toHaveAttribute('aria-valuetext', '25\u202f% of the time');
    await expectTicking(page, LENZ);
    await snap(page, 'lenz-brake');
  });

  test('the coil-load slider, its primary control, sets the brake, and a harder brake stops the wheel sooner', async ({
    page,
    snap,
  }) => {
    await open(page, 'lenz-brake', LENZ);
    // Open coil first: friction alone.
    await load(page).focus();
    await page.keyboard.press('Home');
    await expect(readout(page, LENZ, 'Brake torque')).toHaveText('0.0\u202fnN·m');
    await press(letGo(page));
    await stopped(page);
    const openS = await value(page, 'Time since let go');
    // PHYSICS.md, D10: 1.118 s. The readout holds the stop as the sim
    // locates it within its step, not the frame it was noticed on.
    expect(openS).toBe(1.118);

    // Then most of the time shorted, by tap or click near the slider's top.
    await pressAt(load(page), 0.95);
    // The wheel is at rest now, so the brake reads zero until it turns: Lenz
    // braking needs motion. The next run shows the harder brake.
    await expect.poll(() => value(page, 'Coil shorted')).toBeGreaterThan(80);
    await expect(readout(page, LENZ, 'Brake torque')).toHaveText('0.0\u202fnN·m');
    await press(letGo(page));
    await stopped(page);
    const shortS = await value(page, 'Time since let go');
    expect(shortS).toBeLessThan(0.14);
    expect(shortS).toBeGreaterThan(0.1);
    await snap(page, 'lenz-brake-two-runs');

    // And a third in between, so the plot compares three.
    await pressAt(load(page), 0.3);
    await expect.poll(() => value(page, 'Coil shorted')).toBeLessThan(40);
    await press(letGo(page));
    await stopped(page);
    await snap(page, 'lenz-brake-three-runs');
  });

  test('steps the slider with the arrow keys, 1 % at a time', async ({ page }) => {
    await open(page, 'lenz-brake', LENZ);
    await load(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(readout(page, LENZ, 'Coil shorted')).toHaveText('26\u202f%');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(readout(page, LENZ, 'Coil shorted')).toHaveText('24\u202f%');
  });

  test('shows the wheel slowing in slow motion', async ({ page, snap }) => {
    await open(page, 'lenz-brake', LENZ);
    const slow = page.getByRole('button', { name: 'Slow motion for the coil brake, one eighth of real time' });
    await press(slow);
    await expect(readout(page, LENZ, 'Playback')).toHaveText('1/8× real time');
    await press(letGo(page));
    // A quarter of the time shorted stops the wheel in 0.299 s of sim time,
    // 2.4 s at an eighth. Catch it part way.
    await expect.poll(() => value(page, 'Time since let go')).toBeGreaterThan(0.08);
    expect(await value(page, 'Glide wheel speed')).toBeGreaterThan(0);
    await snap(page, 'lenz-brake-slow-motion');
    await stopped(page);
  });

  test('under reduced motion, letting go draws the finished run in the still frame', async ({ page, snap }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'lenz-brake', LENZ);
    await press(letGo(page));
    await expect(readout(page, LENZ, 'Time since let go')).toHaveText('0.299\u202fs');
    await expectStill(page, LENZ);
    await snap(page, 'lenz-brake-reduced-motion-run');
  });

  test('follows the dark colour scheme', async ({ page, snap }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, 'lenz-brake', LENZ);
    await press(letGo(page));
    await stopped(page);
    await snap(page, 'lenz-brake-dark');
  });
});

test.describe('quartz', () => {
  const slow = (page: Page) => page.getByRole('slider', { name: 'Slow the crystal down' });
  const ticksGiven = async (page: Page) =>
    parseInt(((await readout(page, QUARTZ, 'Reference ticks given').textContent()) ?? '').replace(/,/g, ''), 10);

  test('opens slowed 64 times, with the crystal and the reference as the model gives them there', async ({
    page,
    snap,
  }) => {
    await open(page, 'quartz', QUARTZ);
    await expect(readout(page, QUARTZ, 'Playback')).toHaveText('1/64× real time');
    // PHYSICS.md, D11: 32,768 Hz ÷ 64, and 0.125 s × 64.
    await expect(readout(page, QUARTZ, 'Crystal, on screen')).toHaveText('512\u202fHz');
    await expect(readout(page, QUARTZ, 'A reference tick every')).toHaveText('8\u202fs');
    await expect(readout(page, QUARTZ, 'Counter, 0 to 4,095')).toHaveText(/^[\d,]+\u202fcycles$/);
    await expect(slow(page)).toHaveAttribute('aria-valuetext', '1/64 of real time');
    await expectTicking(page, QUARTZ);
    await snap(page, 'quartz');
  });

  test('the slow-down slider, its primary control, runs from real time to the crystal swinging at 8 Hz', async ({
    page,
    snap,
  }) => {
    await open(page, 'quartz', QUARTZ);
    // All the way to real time: the reference ticks eight times a second.
    await pressAt(slow(page), 0.01);
    await expect(readout(page, QUARTZ, 'Playback')).toHaveText('1× real time');
    await expect(readout(page, QUARTZ, 'Crystal, on screen')).toHaveText('32,768\u202fHz');
    await expect(readout(page, QUARTZ, 'A reference tick every')).toHaveText('0.125\u202fs');
    const before = await ticksGiven(page);
    await expect.poll(() => ticksGiven(page)).toBeGreaterThan(before + 4);
    await snap(page, 'quartz-real-time');

    // All the way down: the crystal itself, slowed 4,096 times.
    await pressAt(slow(page), 0.99);
    await expect(readout(page, QUARTZ, 'Playback')).toHaveText('1/4,096× real time');
    await expect(readout(page, QUARTZ, 'Crystal, on screen')).toHaveText('8\u202fHz');
    await expect(readout(page, QUARTZ, 'A reference tick every')).toHaveText('8\u202fmin 32\u202fs');
    await expectTicking(page, QUARTZ);
    await snap(page, 'quartz-slowest');
  });

  test('steps with the arrow keys, a factor of two at a time', async ({ page }) => {
    await open(page, 'quartz', QUARTZ);
    await slow(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(readout(page, QUARTZ, 'Playback')).toHaveText('1/128× real time');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(readout(page, QUARTZ, 'Playback')).toHaveText('1/32× real time');
    await page.keyboard.press('Home');
    await expect(slow(page)).toHaveAttribute('aria-valuetext', 'real time');
  });

  test('under reduced motion, redraws the still frame at a new speed without animating', async ({ page, snap }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'quartz', QUARTZ);
    await pressAt(slow(page), 0.99);
    await expect(readout(page, QUARTZ, 'Playback')).toHaveText('1/4,096× real time');
    await expectStill(page, QUARTZ);
    await snap(page, 'quartz-reduced-motion-slowest');
  });

  test('follows the dark colour scheme', async ({ page, snap }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, 'quartz', QUARTZ);
    await expect.poll(() => ticks(page, QUARTZ)).toBeGreaterThan(30);
    await snap(page, 'quartz-dark');
  });
});

test.describe('loop', () => {
  const faster = (page: Page) =>
    page.getByRole('button', { name: 'Knock the watch so the glide wheel speeds up by 2 rev/s' });
  const slower = (page: Page) =>
    page.getByRole('button', { name: 'Knock the watch so the glide wheel slows down by 2 rev/s' });
  const regulation = (page: Page) =>
    page.getByRole('button', { name: 'Regulation: the IC brakes the glide wheel to hold it on the reference' });
  const value = async (page: Page, label: string) =>
    parseFloat(((await readout(page, LOOP, label).textContent()) ?? '').replace('\u2212', '-'));
  const lockedFor = (page: Page) => value(page, 'Locked for');

  test('opens locked at 8 rev/s, on the steady duty the model gives at full wind', async ({ page, snap }) => {
    await open(page, 'loop', LOOP);
    await expect(readout(page, LOOP, 'Glide wheel speed')).toHaveText('8.000\u202frev/s');
    await expect(readout(page, LOOP, 'Phase error')).toHaveText(/^\u2212?0\.0°$/);
    // PHYSICS.md, D4: 11.2 % of the time shorted holds full wind at 8 rev/s.
    await expect(readout(page, LOOP, 'Brake duty')).toHaveText('11.2\u202f%');
    await expect(readout(page, LOOP, 'Hands vs true time')).toHaveText(/^\u2212?0\.0\u202fms$/);
    await expect(regulation(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => lockedFor(page)).toBeGreaterThan(1);
    await snap(page, 'loop');
  });

  test('a knock, its primary control, is pushed back and lock returns within 3 s', async ({ page, snap }) => {
    await open(page, 'loop', LOOP);
    const pause = page.getByRole('button', { name: 'Pause animations' });
    const resume = page.getByRole('button', { name: 'Resume animations' });
    await press(faster(page));
    // The knock is judged at the next reference tick, an eighth of a second on.
    await expect.poll(() => lockedFor(page)).toBe(0);
    // Stop part way through the response for the screenshot. Where it stops
    // depends on the frame rate, so the size of the error is left to the
    // logic tests (tests/widgets/loop-logic.test.ts); here it is only off zero.
    await frames(page, 15);
    await press(pause);
    await expectStill(page, LOOP);
    expect(Math.abs(await value(page, 'Phase error'))).toBeGreaterThan(0.1);
    await snap(page, 'loop-knock-faster');
    await press(resume);
    // Test 6 (PHYSICS.md): relock within 3.0 s. The poll allows for a slow CI frame rate.
    await expect.poll(() => lockedFor(page), { timeout: 10_000 }).toBeGreaterThan(0.5);
    await expect(readout(page, LOOP, 'Glide wheel speed')).toHaveText(/^(7\.99\d|8\.00\d)\u202frev\/s$/);

    await press(slower(page));
    await expect.poll(() => lockedFor(page)).toBe(0);
    await frames(page, 15);
    await press(pause);
    await expectStill(page, LOOP);
    expect(Math.abs(await value(page, 'Phase error'))).toBeGreaterThan(0.1);
    await snap(page, 'loop-knock-slower');
    await press(resume);
    await expect.poll(() => lockedFor(page), { timeout: 10_000 }).toBeGreaterThan(0.5);
  });

  test('with regulation off the wheel runs away, and back on it relocks with the hands still ahead', async ({
    page,
    snap,
  }) => {
    await open(page, 'loop', LOOP);
    await press(regulation(page));
    await expect(regulation(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(readout(page, LOOP, 'Brake duty')).toHaveText('0.0\u202f%');
    // Unbraked at full wind the wheel heads for 30.6 rev/s (test 1), and the phase error runs off in turns.
    await expect.poll(() => value(page, 'Glide wheel speed'), { timeout: 10_000 }).toBeGreaterThan(25);
    await expect(readout(page, LOOP, 'Phase error')).toHaveText(/^\+[\d.]+\u202fturns$/);
    await snap(page, 'loop-regulation-off');

    await press(regulation(page));
    await expect(regulation(page)).toHaveAttribute('aria-pressed', 'true');
    // The reference restarts from the wheel, and the loop pulls it back to 8 rev/s.
    await expect.poll(() => lockedFor(page), { timeout: 15_000 }).toBeGreaterThan(0.5);
    await expect(readout(page, LOOP, 'Hands vs true time')).toHaveText(/^\+\d+\.\d\d\u202fs$/);
    await snap(page, 'loop-relocked');
  });

  test('under reduced motion, a knock draws its whole response in the still frame', async ({ page, snap }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'loop', LOOP);
    await press(faster(page));
    await expectStill(page, LOOP);
    // Six seconds of sim time were run at once: relocked, as test 6 promises within 3.0 s.
    expect(await lockedFor(page)).toBeGreaterThan(2);
    await snap(page, 'loop-reduced-motion-knock');
  });

  test('follows the dark colour scheme', async ({ page, snap }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, 'loop', LOOP);
    await press(slower(page));
    await frames(page, 45);
    await snap(page, 'loop-dark');
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

  test('gives every control on the page its own accessible name, so no two widgets’ controls are confused', async ({
    page,
  }) => {
    await page.goto('/');
    for (const w of WIDGETS) await reach(page, w.name, w.selector);
    const names = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, input')].map(
        (el) => el.getAttribute('aria-label') ?? el.closest('label')?.textContent ?? el.textContent ?? '',
      ),
    );
    expect(names.length).toBeGreaterThan(WIDGETS.length);
    expect(new Set(names).size).toBe(names.length);
  });

  test('stops on global pause, with a screenshot of the paused page', async ({ page, snap }) => {
    await open(page, 'hero-glide', HERO);
    await press(page.getByRole('button', { name: 'Pause animations' }));
    await expectStill(page, HERO);
    await snap(page, 'global-paused');
  });
});
