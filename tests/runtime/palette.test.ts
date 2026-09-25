import { describe, expect, it } from 'vitest';
import {
  PART_IDS,
  THEMES,
  UI_IDS,
  contrastRatio,
  cssVar,
  paletteCss,
  parseHex,
  relativeLuminance,
  type Scheme,
} from '../../src/runtime/palette.ts';

const SCHEMES: Scheme[] = ['light', 'dark'];

// WCAG 2.1 AA for body text. Part colours are used as prose text colours in
// `span.part`, not only as strokes, so they must meet the text threshold.
const AA_TEXT = 4.5;

describe('contrast arithmetic', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    // #767676 on white is the well-known darkest grey that just clears 4.5:1.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('rejects anything but #rrggbb', () => {
    expect(() => parseHex('red')).toThrow();
    expect(() => parseHex('#fff')).toThrow();
  });
});

describe('the palette', () => {
  for (const scheme of SCHEMES) {
    const { parts, ui } = THEMES[scheme];

    it(`defines every part and UI token as #rrggbb in the ${scheme} theme`, () => {
      for (const id of PART_IDS) expect(parts[id]).toMatch(/^#[0-9a-f]{6}$/i);
      for (const id of UI_IDS) expect(ui[id]).toMatch(/^#[0-9a-f]{6}$/i);
    });

    for (const id of PART_IDS) {
      it(`makes ${id} readable as prose text on the ${scheme} background and widget surface`, () => {
        expect(contrastRatio(parts[id], ui.background)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(parts[id], ui.surface)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }

    it(`makes text, muted text, and button labels readable in the ${scheme} theme`, () => {
      expect(contrastRatio(ui.text, ui.background)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(ui.muted, ui.background)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(ui.muted, ui.surface)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(ui.onAccent, ui.accent)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it(`gives every part a distinct colour in the ${scheme} theme`, () => {
      const colours = PART_IDS.map((id) => parts[id].toLowerCase());
      expect(new Set(colours).size).toBe(colours.length);
    });
  }
});

describe('paletteCss', () => {
  const css = paletteCss();

  it('names custom properties in kebab case', () => {
    expect(cssVar('part', 'rotor')).toBe('--part-rotor');
    expect(cssVar('ui', 'onAccent')).toBe('--ui-on-accent');
  });

  it('puts the light theme on :root and the dark theme under prefers-color-scheme: dark', () => {
    const [light, dark] = css.split('@media (prefers-color-scheme: dark)');
    expect(light).toContain(`--part-rotor:${THEMES.light.parts.rotor};`);
    expect(dark).toContain(`--part-rotor:${THEMES.dark.parts.rotor};`);
    expect(light).not.toContain(THEMES.dark.parts.rotor);
  });

  it('emits every token for both themes', () => {
    for (const scheme of SCHEMES) {
      for (const id of PART_IDS) expect(css).toContain(`${cssVar('part', id)}:${THEMES[scheme].parts[id]};`);
      for (const id of UI_IDS) expect(css).toContain(`${cssVar('ui', id)}:${THEMES[scheme].ui[id]};`);
    }
  });

  it('colours each span.part from its token, so prose and widgets share one source', () => {
    for (const id of PART_IDS) {
      expect(css).toContain(`.part[data-part="${id}"]{color:var(--part-${id});}`);
    }
  });
});
