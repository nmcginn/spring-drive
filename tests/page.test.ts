import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PART_IDS } from '../src/runtime/palette.ts';
import { WIDGETS } from '../src/widgets/registry.ts';

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
});
