import type { Page } from '@playwright/test';
import { DEFAULT_PARAMS } from '../../src/sim/params.ts';
import { speedMaxRevS, speedValueText } from '../../src/widgets/generator/logic.ts';
import { dutyValueText } from '../../src/widgets/lenz-brake/logic.ts';
import { maxSlowExponent, slowValueText } from '../../src/widgets/quartz/logic.ts';
import { RATES, rateValueText } from '../../src/widgets/tri-synchro/logic.ts';
import { expect, frames, readout, test } from './fixtures.ts';

// Keyboard access (M9c, decision 41). Every control on the page is a native
// button or range input, so each one already works from the keyboard once it
// exists. What these tests guard is everything around that: that Tab reaches
// every control even when widgets are screens apart and not yet mounted, in
// reading order both ways; that a focused control is visible, outlined, and
// not under the fixed pause button; that the pause button comes first; and
// that each kind of control does its job from the keyboard alone.

const WIDGET_ORDER = [
  'widget-hero-glide',
  'widget-runaway',
  'widget-generator',
  'widget-lenz-brake',
  'widget-quartz',
  'widget-loop',
  'widget-tri-synchro',
];

/**
 * How far apart the padded page puts its widgets: several screens, as the
 * written article will, so that the next widget down has not mounted when
 * focus leaves the one above it. The lazy mount margin is one screen.
 */
const PROSE_GAP_PX = 4000;

/**
 * Serve the article with a tall block of "prose" before every widget slot,
 * from the first byte, so the slots are screens apart before any script
 * runs, as they will be when the prose is written.
 */
async function openPadded(page: Page): Promise<void> {
  await page.route('/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replaceAll(
      '<figure class="widget-slot"',
      `<div class="test-prose" style="height: ${PROSE_GAP_PX}px"></div><figure class="widget-slot"`,
    );
    await route.fulfill({ response, body: html });
  });
  await page.goto('/');
}

/** Scroll to a widget's slot and wait for its widget to mount. */
async function mounted(page: Page, id: string): Promise<void> {
  const slot = page.locator(`[data-widget="${id}"]`);
  await slot.scrollIntoViewIfNeeded();
  await expect(slot).toHaveAttribute('data-mounted', 'true');
}

interface Stop {
  /** The widget the focused element belongs to, or its tag name outside one. */
  owner: string;
  /** The accessible name: aria-label, else the element's own text. */
  name: string;
  inViewport: boolean;
  underPauseButton: boolean;
  outlined: boolean;
}

/** Where focus is now, and whether a sighted keyboard reader can see it. */
async function focusStop(page: Page): Promise<Stop> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return { owner: 'BODY', name: '', inViewport: false, underPauseButton: false, outlined: false };
    }
    const widget = el.closest<HTMLElement>('.widget');
    const owner = widget ? ([...widget.classList].find((c) => c.startsWith('widget-')) ?? '') : el.tagName;
    const r = el.getBoundingClientRect();
    const pause = document.querySelector<HTMLElement>('[data-global-pause]');
    const p = pause?.getBoundingClientRect();
    const underPauseButton =
      !!p && el !== pause && r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top;
    const style = getComputedStyle(el);
    return {
      owner,
      name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
      inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.height > 0,
      underPauseButton,
      outlined: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
    };
  });
}

/**
 * Press `key` until focus leaves the page, or `limit` presses. Each press waits for focus to settle, because a press
 * that lands on a widget still loading moves on into it once it mounts.
 */
async function walk(page: Page, key: 'Tab' | 'Shift+Tab', limit = 60): Promise<Stop[]> {
  const stops: Stop[] = [];
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(key);
    await expect.poll(() => page.evaluate(() => !document.activeElement?.matches('.widget-slot'))).toBe(true);
    await frames(page, 1);
    const stop = await focusStop(page);
    // Past the last control, focus leaves the page for the browser's own
    // controls, which the page sees as the body. Anywhere else, the body
    // means focus was dropped, and the walk stopping short fails the test.
    if (stop.owner === 'BODY') break;
    stops.push(stop);
  }
  return stops;
}

/** The widgets visited, in order, each once however many controls it has. */
function widgetsVisited(stops: readonly Stop[]): string[] {
  const owners = stops.map((s) => s.owner).filter((o) => o.startsWith('widget-'));
  return owners.filter((o, i) => owners[i - 1] !== o);
}

test.describe('keyboard', () => {
  test('the pause button is the first Tab stop, and Enter and Space each pause and resume', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const pause = page.getByRole('button', { name: 'Pause animations' });
    await expect(pause).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Resume animations' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(pause).toBeFocused();
  });

  test('Tab reaches every widget in reading order, though each is screens below the last and not yet mounted', async ({
    page,
  }) => {
    await openPadded(page);
    // Nothing below the first screen or two has mounted: the padding is
    // what makes this test, so check it took.
    await expect(page.locator('[data-widget="tri-synchro"]')).not.toHaveAttribute('data-mounted');
    const stops = await walk(page, 'Tab');
    expect(widgetsVisited(stops)).toEqual(WIDGET_ORDER);
    // The walk ran to the end, the footnote's link, not stopping at focus dropped on the way.
    expect(stops.at(-1)?.owner).toBe('A');
  });

  test('Shift+Tab reaches every widget in reverse, entering each from its last control', async ({ page }) => {
    await openPadded(page);
    await page.locator('.article-footer a').focus();
    const stops = await walk(page, 'Shift+Tab');
    expect(widgetsVisited(stops)).toEqual([...WIDGET_ORDER].reverse());
    // Run back to the start, the pause button, with no focus dropped on the way.
    expect(stops.at(-1)?.name).toBe('Pause animations');
    // Backwards into tri-synchro lands on its last control, not its first.
    const firstInTri = stops.find((s) => s.owner === 'widget-tri-synchro');
    expect(firstInTri?.name).toBe('Time runs at: how fast the whole reserve plays');
  });

  test('every control on the page, focused from the keyboard, is on screen, outlined, and clear of the pause button', async ({
    page,
    snap,
  }) => {
    await openPadded(page);
    const stops = await walk(page, 'Tab');
    const controls = stops.filter((s) => s.owner.startsWith('widget-'));
    // Every control of every widget: buttons other than the hidden Play
    // buttons, and sliders. Counted on the page once all have mounted.
    const expected = await page.locator('.widget .controls button:visible, .widget .controls input').count();
    expect(controls.length).toBe(expected);
    for (const stop of stops) {
      expect(stop, `${stop.owner}: ${stop.name}`).toMatchObject({
        inViewport: true,
        underPauseButton: false,
        outlined: true,
      });
    }
    // A slider and a toggle as Tab leaves them, outlined, for review.
    await page.getByRole('slider', { name: /^Time runs at/ }).focus();
    await snap(page, 'keyboard-focus-slider');
    await page.keyboard.press('Shift+Tab');
    await snap(page, 'keyboard-focus-button');
  });

  test('a widget focused while still loading hands focus to its first control once it mounts', async ({ page }) => {
    await openPadded(page);
    const slot = page.locator('[data-widget="quartz"]');
    await expect(slot).not.toHaveAttribute('data-mounted');
    await slot.focus();
    await expect(page.getByRole('slider', { name: /^Slow the crystal down/ })).toBeFocused();
    // Mounted, the slot is no longer a Tab stop of its own.
    await expect(slot).not.toHaveAttribute('tabindex');
    await expect(slot).not.toHaveAttribute('aria-busy');
  });

  test('under reduced motion, Tab reaches each widget’s Play button first, and Space starts it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPadded(page);
    const stops = await walk(page, 'Tab');
    const firstInEach = WIDGET_ORDER.map((w) => stops.find((s) => s.owner === w)?.name);
    expect(firstInEach.every((name) => name?.startsWith('Play '))).toBe(true);
    await mounted(page, 'generator');
    const play = page.getByRole('button', { name: 'Play the generator' });
    await play.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause the generator' })).toBeFocused();
  });

  test('toggles switch with Space and Enter, and announce it', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /^Slow motion, one eighth/ });
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('sliders jump to their ends with Home and End, and announce each value with its unit', async ({ page }) => {
    await openPadded(page);
    const sliders = [
      {
        id: 'generator',
        name: /^Glide wheel speed/,
        home: speedValueText(0),
        end: speedValueText(speedMaxRevS(DEFAULT_PARAMS)),
      },
      { id: 'lenz-brake', name: /^Coil shorted/, home: dutyValueText(0), end: dutyValueText(1) },
      {
        id: 'quartz',
        name: /^Slow the crystal down/,
        home: slowValueText(0),
        end: slowValueText(maxSlowExponent(DEFAULT_PARAMS)),
      },
      { id: 'tri-synchro', name: /^Time runs at/, home: rateValueText(RATES[0]!), end: rateValueText(RATES.at(-1)!) },
    ];
    for (const s of sliders) {
      await mounted(page, s.id);
      const slider = page.getByRole('slider', { name: s.name });
      await slider.focus();
      await expect(slider).toBeFocused();
      await page.keyboard.press('Home');
      await expect(slider).toHaveAttribute('aria-valuetext', s.home);
      await page.keyboard.press('End');
      await expect(slider).toHaveAttribute('aria-valuetext', s.end);
    }
  });

  test('every button acts from the keyboard: Enter winds, knocks, lets go, and skips', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPadded(page);
    // Under reduced motion nothing ticks, so any change in a readout is the
    // key press's doing.
    const actions = [
      {
        button: /^Wind the mainspring fully and set the hands/,
        id: 'runaway',
        widget: '.widget-runaway',
        readout: 'Mainspring wound',
      },
      { button: /^Let go at 8 rev\/s/, id: 'lenz-brake', widget: '.widget-lenz-brake', readout: 'Time since let go' },
      { button: /^Knock \+2 rev\/s/, id: 'loop', widget: '.widget-loop', readout: 'Locked for' },
      { button: /^Skip 6 h/, id: 'tri-synchro', widget: '.widget-tri-synchro', readout: 'Time since wound' },
    ];
    for (const a of actions) {
      await mounted(page, a.id);
      const button = page.getByRole('button', { name: a.button });
      await button.focus();
      const before = await readout(page, a.widget, a.readout).textContent();
      await page.keyboard.press('Enter');
      await expect(readout(page, a.widget, a.readout)).not.toHaveText(before ?? '');
      await expect(button).toBeFocused();
    }
  });
});
