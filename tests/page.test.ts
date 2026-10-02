import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PART_IDS } from '../src/runtime/palette.ts';
import { WIDGETS } from '../src/widgets/registry.ts';
import { metaContent, pageTitle } from '../tools/head.ts';
import { proseTerms } from './prose.ts';

// Checks on index.html that do not need a browser.

const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');

describe('index.html', () => {
  it('only uses data-part names the palette defines, so every part in the prose has a colour', () => {
    // Includes names inside PROSE stubs, which become live markup when the
    // maintainer writes the text.
    const used = [...html.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const part of used) expect(PART_IDS).toContain(part);
  });

  it('calls each part by words it uses for no other part, so a name has one colour', () => {
    // Decision 40: widgets colour a label by the part its words name in the
    // prose, which only works if the words name one part.
    const byTerm = new Map<string, Set<string>>();
    for (const { term, part } of proseTerms(html)) byTerm.set(term, (byTerm.get(term) ?? new Set()).add(part));
    for (const [term, parts] of byTerm) expect([term, [...parts]]).toEqual([term, [...parts].slice(0, 1)]);
  });

  it('only has widget slots for registered widgets', () => {
    const slots = [...html.matchAll(/data-widget="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(slots.length).toBeGreaterThan(0);
    for (const id of slots) expect(Object.keys(WIDGETS)).toContain(id);
  });

  it('references no other origin for scripts, styles, or fonts', () => {
    const sources = [...html.matchAll(/<(?:script|link|img)[^>]*(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const src of sources) expect(src).not.toMatch(/^(https?:)?\/\//);
  });

  it('has the placeholder the build inlines the palette into', () => {
    expect(html).toContain('<style id="palette"></style>');
  });

  it('credits Ciechanowski’s Mechanical Watch as the inspiration', () => {
    expect(html).toContain('href="https://ciechanow.ski/mechanical-watch/"');
  });

  it('shares under its own title and description, so a link preview says what the page does', () => {
    // Decision 42: the Open Graph tags repeat the page's own, by hand, and
    // this holds them equal.
    expect(metaContent(html, 'og:title')).toBe(pageTitle(html));
    expect(metaContent(html, 'og:description')).toBe(metaContent(html, 'description'));
    expect(metaContent(html, 'og:type')).toBe('article');
  });

  it('asks for the large preview card, and describes its image the same way to every reader', () => {
    expect(metaContent(html, 'twitter:card')).toBe('summary_large_image');
    expect(metaContent(html, 'og:image:alt')?.length).toBeGreaterThan(0);
    expect(metaContent(html, 'twitter:image:alt')).toBe(metaContent(html, 'og:image:alt'));
    expect(metaContent(html, 'og:image:type')).toBe('image/png');
  });

  it('points every icon and image in its head at a file the build serves', () => {
    const local = [
      ...[...html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)].map((m) => m[1] ?? ''),
      metaContent(html, 'og:image') ?? '',
    ];
    expect(local).toHaveLength(3);
    for (const path of local) {
      expect(path).toMatch(/^\/[^/]/);
      expect(existsSync(join(import.meta.dirname, '..', 'public', path))).toBe(true);
    }
  });

  it('writes the page’s own URL relative, for the build to make absolute or leave out (decision 42)', () => {
    expect(metaContent(html, 'og:url')).toBe('/');
    expect(html).toContain('<link rel="canonical" href="/" vite-ignore />');
  });
});
