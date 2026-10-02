import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { metaContent } from '../../tools/head.ts';
import {
  FAVICON_ICO,
  ICO_SIZES_PX,
  OG_IMAGE,
  RENDERED,
  RENDER_SOURCES,
  ROOT,
  TOUCH_ICON,
  renderDigest,
} from '../../tools/og/inputs.ts';
import {
  CARD_HEIGHT_PX,
  CARD_WIDTH_PX,
  SAFE_AREA,
  TOUCH_ICON_PX,
  cardLayout,
  contains,
  dialBounds,
  fits,
  overlaps,
  wrapLines,
} from '../../tools/og/layout.ts';
import { icoEntries, pngSize } from '../harness/png.ts';
import { INDEX_HTML } from '../prose.ts';

// The share card and the home-screen icon (decision 42): the card's geometry
// as pure functions, and the committed images as files.

/** A stand-in for canvas text measurement: every character 10 px wide. */
const tenPx = (s: string) => s.length * 10;

describe('wrapLines', () => {
  it('fills each line greedily and keeps every word, in order', () => {
    const text = 'How Seiko’s Spring Drive keeps time, explained with interactive simulations.';
    const lines = wrapLines(text, 250, tenPx);
    expect(lines.join(' ')).toBe(text);
    for (const line of lines) expect(tenPx(line)).toBeLessThanOrEqual(250);
    // Greedy: no line could have taken the next line's first word.
    for (let i = 0; i + 1 < lines.length; i++) {
      const next = lines[i + 1]?.split(' ')[0] ?? '';
      expect(tenPx(`${lines[i]} ${next}`)).toBeGreaterThan(250);
    }
  });

  it('gives a word wider than the line a line of its own rather than splitting it', () => {
    expect(wrapLines('a electromagnetically b', 50, tenPx)).toEqual(['a', 'electromagnetically', 'b']);
  });

  it('collapses runs of whitespace, as the browser does in an attribute it shows', () => {
    expect(wrapLines('  one \n two  ', 1000, tenPx)).toEqual(['one two']);
    expect(wrapLines('   ', 1000, tenPx)).toEqual([]);
  });
});

describe('cardLayout', () => {
  it('fits the description in one to three lines, with nothing outside the margin and nothing overlapping', () => {
    for (const lines of [1, 2, 3]) {
      const l = cardLayout(lines);
      expect(fits(l)).toBe(true);
      expect(contains(SAFE_AREA, l.text)).toBe(true);
      expect(contains(SAFE_AREA, l.wheelBounds)).toBe(true);
      expect(contains(SAFE_AREA, dialBounds(l))).toBe(true);
    }
  });

  it('refuses a description too long for the card, so the render fails rather than drawing text over the wheel', () => {
    expect(fits(cardLayout(6))).toBe(false);
  });

  it('puts each description line below the title and the one before it', () => {
    const l = cardLayout(3);
    const baselines = [l.title.baseline, ...l.description.baselines];
    for (let i = 1; i < baselines.length; i++) expect(baselines[i]).toBeGreaterThan(baselines[i - 1] ?? Infinity);
  });

  it('centres the coil over the wheel, as the generator widget does', () => {
    const l = cardLayout(3);
    expect(l.coil.x + l.coil.width / 2).toBeCloseTo(l.wheel.cx, 12);
    expect(l.coil.y + l.coil.height).toBeLessThan(l.wheel.cy - l.wheel.radius);
  });

  it('keeps the dial clear of the text and the wheel', () => {
    const l = cardLayout(3);
    expect(overlaps(l.text, dialBounds(l))).toBe(false);
    expect(overlaps(l.wheelBounds, dialBounds(l))).toBe(false);
  });
});

describe('the box helpers', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  it('treat boxes that only touch as not overlapping, and a box as inside itself', () => {
    expect(overlaps(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(overlaps(a, { x: 9, y: 9, width: 5, height: 5 })).toBe(true);
    expect(contains(a, a)).toBe(true);
    expect(contains(a, { x: 1, y: 1, width: 10, height: 1 })).toBe(false);
  });
});

describe('renderDigest', () => {
  // A copy of every input, edited one way at a time.
  function withCopy(edit: (root: string) => void): string {
    const root = mkdtempSync(join(tmpdir(), 'og-digest-'));
    try {
      for (const file of [...RENDER_SOURCES, 'index.html', 'node_modules/@fontsource/jost/package.json']) {
        cpSync(join(ROOT, file), join(root, file));
      }
      edit(root);
      return renderDigest(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const replaceIn = (root: string, file: string, from: string, to: string) => {
    const text = readFileSync(join(root, file), 'utf8');
    expect(text).toContain(from);
    writeFileSync(join(root, file), text.replace(from, to));
  };

  it('is the same for the same inputs, wherever they are checked out and whatever their line endings', () => {
    expect(withCopy(() => {})).toBe(renderDigest());
    expect(
      withCopy((root) => {
        const file = join(root, 'tools/og/card.ts');
        writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
      }),
    ).toBe(renderDigest());
  });

  it('changes when the palette, the drawing, or the words on the card change', () => {
    const base = renderDigest();
    expect(withCopy((r) => replaceIn(r, 'src/runtime/palette.ts', "rotor: '#1f5fa8'", "rotor: '#1f5fa9'"))).not.toBe(
      base,
    );
    expect(
      withCopy((r) => replaceIn(r, 'src/widgets/shared/draw.ts', 'ctx.lineWidth = 1.5;', 'ctx.lineWidth = 2;')),
    ).not.toBe(base);
    expect(withCopy((r) => replaceIn(r, 'index.html', 'content="Spring Drive"', 'content="Spring Drive!"'))).not.toBe(
      base,
    );
  });

  it('does not change when only the prose stubs in index.html do, so writing the article asks for no re-render', () => {
    expect(withCopy((r) => replaceIn(r, 'index.html', '<!-- PROSE: open on', '<!-- PROSE: begin with'))).toBe(
      renderDigest(),
    );
  });
});

describe('the committed images', () => {
  it('were drawn from the current palette, drawing code, and title: if not, run `npm run og-image`', () => {
    const recorded = (JSON.parse(readFileSync(RENDERED, 'utf8')) as { digest: string }).digest;
    expect(recorded, 'public/ is stale: run `npm run og-image` and commit what it writes').toBe(renderDigest());
  });

  it('include a share card the size index.html declares, 1,200 × 630', () => {
    const size = pngSize(readFileSync(OG_IMAGE));
    expect(size).toEqual({ width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX });
    expect(metaContent(INDEX_HTML, 'og:image:width')).toBe(String(size.width));
    expect(metaContent(INDEX_HTML, 'og:image:height')).toBe(String(size.height));
  });

  it('keep the share card small enough for every preview to fetch it', () => {
    // WhatsApp is the strictest consumer commonly reported, skipping images
    // over about 300 kB; X's limit is 5 MB. The card is flat colour and
    // compresses to well under this.
    expect(statSync(OG_IMAGE).size).toBeLessThan(300_000);
  });

  it('include a home-screen icon at the size iOS asks for, 180 × 180', () => {
    expect(pngSize(readFileSync(TOUCH_ICON))).toEqual({ width: TOUCH_ICON_PX, height: TOUCH_ICON_PX });
  });

  it('include a favicon.ico holding the icon at 16, 32, and 48 px, each a PNG of its stated size', () => {
    const entries = icoEntries(readFileSync(FAVICON_ICO));
    expect(entries.map((e) => e.sizePx)).toEqual([...ICO_SIZES_PX]);
    for (const e of entries) expect(pngSize(e.png)).toEqual({ width: e.sizePx, height: e.sizePx });
  });
});
