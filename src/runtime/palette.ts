// Colour tokens shared by the prose and the widgets. A part is the same
// colour in a sentence (`<span class="part" data-part="rotor">`) and in every
// widget that draws it, which is how the reader connects the two.
//
// This module is pure data plus pure functions, with no DOM access at import
// time, because vite.config.ts imports it too: `paletteCss` is inlined into
// index.html at build time, so the prose is coloured before any script runs.

/** The movement's parts, as named in `data-part` attributes and widget code. */
export const PART_IDS = ['mainspring', 'train', 'rotor', 'coil', 'capacitor', 'quartz', 'ic', 'hand'] as const;
export type PartId = (typeof PART_IDS)[number];

export const UI_IDS = ['background', 'surface', 'text', 'muted', 'grid', 'accent', 'onAccent'] as const;
export type UiId = (typeof UI_IDS)[number];

export interface Theme {
  parts: Readonly<Record<PartId, string>>;
  ui: Readonly<Record<UiId, string>>;
}

export type Scheme = 'light' | 'dark';

// Part colours are used as prose text colours as well as strokes, so each one
// clears WCAG AA for body text (4.5:1) against its theme's background and
// surface. tests/runtime/palette.test.ts checks every pair. Controls use the
// neutral accent, never a part colour, so a button is not mistaken for a part.
export const THEMES: Readonly<Record<Scheme, Theme>> = {
  light: {
    parts: {
      mainspring: '#8f5500',
      train: '#555d6a',
      rotor: '#1f5fa8',
      coil: '#b0302a',
      capacitor: '#26713f',
      quartz: '#6a3fb5',
      ic: '#136c70',
      hand: '#1d1d1f',
    },
    ui: {
      background: '#fbfaf7',
      surface: '#f1eee7',
      text: '#1d1d1f',
      muted: '#5d5d63',
      grid: '#d9d5cc',
      accent: '#3d3d44',
      onAccent: '#fbfaf7',
    },
  },
  dark: {
    parts: {
      mainspring: '#f0a93b',
      train: '#a3acb9',
      rotor: '#6fb0f5',
      coil: '#ff8a80',
      capacitor: '#6fd08c',
      quartz: '#b99af5',
      ic: '#4fd1c9',
      hand: '#f2f0ea',
    },
    ui: {
      background: '#16171a',
      surface: '#202227',
      text: '#ecebe6',
      muted: '#a4a4ab',
      grid: '#3a3c42',
      accent: '#d8d6cf',
      onAccent: '#16171a',
    },
  },
};

/** CSS custom property for a token: `--part-rotor`, `--ui-on-accent`. */
export function cssVar(kind: 'part' | 'ui', id: string): string {
  const kebab = id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return `--${kind}-${kebab}`;
}

function declarations(theme: Theme): string {
  const lines = [
    ...PART_IDS.map((id) => `${cssVar('part', id)}:${theme.parts[id]};`),
    ...UI_IDS.map((id) => `${cssVar('ui', id)}:${theme.ui[id]};`),
  ];
  return lines.join('');
}

/**
 * The palette as CSS: light tokens on `:root`, dark tokens under
 * `prefers-color-scheme: dark`, and a `.part` rule per part so prose picks
 * up its colour from the same source as the widgets.
 */
export function paletteCss(themes: Readonly<Record<Scheme, Theme>> = THEMES): string {
  const partRules = PART_IDS.map((id) => `.part[data-part="${id}"]{color:var(${cssVar('part', id)});}`).join('');
  return (
    `:root{color-scheme:light dark;${declarations(themes.light)}}` +
    `@media (prefers-color-scheme: dark){:root{${declarations(themes.dark)}}}` +
    partRules
  );
}

/** Parse `#rrggbb` into 0 to 255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [, r, g, b] = match ?? [];
  if (!r || !g || !b) throw new Error(`Not a #rrggbb colour: ${hex}`);
  return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)];
}

/** WCAG 2 relative luminance of an sRGB colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The live scheme. Widgets call `theme()` at draw time, so a scheme change
// takes effect on their next frame; `onSchemeChange` lets a widget that is
// not ticking redraw its static frame.

function schemeQuery(): MediaQueryList | undefined {
  return typeof window === 'undefined' ? undefined : window.matchMedia('(prefers-color-scheme: dark)');
}

export function currentScheme(): Scheme {
  return schemeQuery()?.matches ? 'dark' : 'light';
}

/** The tokens for the reader's current colour scheme. */
export function theme(): Theme {
  return THEMES[currentScheme()];
}

/** Subscribe to colour-scheme changes. Returns an unsubscribe function. */
export function onSchemeChange(callback: (scheme: Scheme) => void): () => void {
  const query = schemeQuery();
  if (!query) return () => {};
  const listener = (event: MediaQueryListEvent) => callback(event.matches ? 'dark' : 'light');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
