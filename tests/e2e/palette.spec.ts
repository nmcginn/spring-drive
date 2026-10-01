import type { Page } from '@playwright/test';
import { PART_IDS, THEMES, type PartId, type Scheme } from '../../src/runtime/palette.ts';
import { namedPart, proseTerms } from '../prose.ts';
import { expect, frames, press, test } from './fixtures.ts';

// Decision 40: a part is the same colour in a sentence, on a canvas, and in a
// readout. The Vitest checks prove the table widgets draw from and the
// readouts' markup; this proves the page as a reader gets it, in both colour
// schemes: every label a widget draws that begins with a part's name, as the
// prose names it, is drawn in that part's colour, and so is every readout
// label that carries a part, after the page's CSS has had its say.

interface Drawn {
  widget: string;
  text: string;
  colour: string;
}

/** Record every fillText on every canvas: the widget it is in, the text, and the fill it was drawn with. */
async function recordLabels(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = new Map<string, { widget: string; text: string; colour: string }>();
    (window as unknown as { __drawn: typeof seen }).__drawn = seen;
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      const widget = this.canvas.closest('.widget')?.className ?? '';
      const colour = String(this.fillStyle).toLowerCase();
      seen.set(`${widget}|${text}|${colour}`, { widget, text, colour });
      return fillText.call(this, text, x, y, maxWidth);
    };
  });
}

async function drawn(page: Page): Promise<Drawn[]> {
  return page.evaluate(() => [...(window as unknown as { __drawn: Map<string, Drawn> }).__drawn.values()]);
}

/** The CSS colour `rgb(r, g, b)` of a palette hex, as getComputedStyle reports it. */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

async function reach(page: Page, id: string): Promise<void> {
  await page.locator(`[data-widget="${id}"]`).scrollIntoViewIfNeeded();
  await expect(page.locator(`.widget-${id}`)).toBeVisible();
}

/**
 * Take every widget through the states whose labels differ: wound, let go,
 * knocked, unregulated, and run to a stop. The labels drawn along the way are
 * what the checks below read.
 */
async function tour(page: Page): Promise<void> {
  const button = (name: string) => page.getByRole('button', { name });
  await reach(page, 'hero-glide');
  await frames(page, 5);
  await reach(page, 'runaway');
  await press(button('Wind the mainspring fully and set the hands to 12:00'));
  await frames(page, 5);
  await reach(page, 'generator');
  await frames(page, 5);
  await reach(page, 'lenz-brake');
  await press(button('Let go at 8 rev/s: release the glide wheel'));
  await frames(page, 5);
  await reach(page, 'quartz');
  await frames(page, 5);
  await reach(page, 'loop');
  await press(button('Knock +2 rev/s: a knock that speeds the glide wheel up by 2 rev/s'));
  await frames(page, 5);
  await press(button('Regulation: the IC brakes the glide wheel to hold it on the reference'));
  await frames(page, 5);
  await reach(page, 'tri-synchro');
  // Thirteen six-hour skips is 78 h: past regulation's end, the brownout, and the stop.
  for (let i = 0; i < 13; i++) await press(button('Skip 6 h: six hours ahead'));
  await frames(page, 5);
}

for (const scheme of ['light', 'dark'] as const satisfies readonly Scheme[]) {
  test.describe(`palette, ${scheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await recordLabels(page);
      await page.goto('/');
    });

    test('colours a part in the prose with its palette token', async ({ page }) => {
      // The prose is still stubs, so the spans are in comments; put one of
      // each on the page and read what the inlined palette makes of it.
      const computed = await page.evaluate((parts) => {
        const main = document.querySelector('main');
        return parts.map((part) => {
          const span = Object.assign(document.createElement('span'), { className: 'part', textContent: part });
          span.dataset.part = part;
          main?.append(span);
          return getComputedStyle(span).color;
        });
      }, PART_IDS);
      expect(computed).toEqual(PART_IDS.map((id) => rgb(THEMES[scheme].parts[id])));
    });

    test('draws every canvas label that names a part in that part’s colour', async ({ page }) => {
      await tour(page);
      const terms = proseTerms();
      const labels = await drawn(page);
      const named = labels.flatMap((l) => {
        const part = namedPart(l.text, terms);
        return part ? [{ ...l, part }] : [];
      });
      const wrong = named.filter((l) => l.colour !== THEMES[scheme].parts[l.part]);
      expect(wrong).toEqual([]);
      // Not vacuous: the tour reached labels naming each of these parts.
      const reached = new Set<PartId>(named.map((l) => l.part));
      for (const part of ['rotor', 'mainspring', 'coil', 'quartz', 'ic', 'capacitor'] as const) {
        expect(reached).toContain(part);
      }
    });

    test('colours every readout label that carries a part as the prose colours it', async ({ page }) => {
      await tour(page);
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.readouts dt')].map((dt) => ({
          text: dt.textContent ?? '',
          part: dt.dataset.part ?? null,
          colour: getComputedStyle(dt).color,
        })),
      );
      const keyed = labels.filter((l) => l.part);
      expect(keyed.length).toBeGreaterThan(20);
      for (const l of keyed) {
        expect({ text: l.text, colour: l.colour }).toEqual({
          text: l.text,
          colour: rgb(THEMES[scheme].parts[l.part as PartId]),
        });
      }
      // The rest stay the readouts' muted grey, so a part colour always means a part.
      for (const l of labels.filter((x) => !x.part)) {
        expect({ text: l.text, colour: l.colour }).toEqual({ text: l.text, colour: rgb(THEMES[scheme].ui.muted) });
      }
    });
  });
}
