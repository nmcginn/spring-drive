import { describe, expect, it } from 'vitest';
import { namedPart, proseTerms } from '../prose.ts';

// The palette checks in tests/page.test.ts, tests/widgets/mount.test.ts, and
// tests/e2e/palette.spec.ts rest on these two helpers, so they are checked
// here on markup written by hand.

const HTML = `
  <p>The <span class="part" data-part="rotor">glide wheel</span> and the
  <span class="part" data-part="quartz">quartz crystal</span>, whose
  <span class="part" data-part="quartz">crystal</span> rings;
  <!-- PROSE: the <span class="part" data-part="ic">IC</span> and the <span class="part" data-part="hand">hands</span>. -->
  the <span class="part" data-part="rotor">Glide wheel</span> again.</p>`;

describe('proseTerms', () => {
  it('reads every part span, stubs included, once per term and part, in lower case', () => {
    expect(proseTerms(HTML)).toEqual([
      { term: 'glide wheel', part: 'rotor' },
      { term: 'quartz crystal', part: 'quartz' },
      { term: 'crystal', part: 'quartz' },
      { term: 'ic', part: 'ic' },
      { term: 'hands', part: 'hand' },
    ]);
  });

  it('refuses a part the palette does not define', () => {
    expect(() => proseTerms('<span class="part" data-part="balance">balance</span>')).toThrow(/balance/);
  });

  it('reads the real article', () => {
    const parts = new Set(proseTerms().map((t) => t.part));
    for (const part of ['rotor', 'coil', 'mainspring', 'quartz', 'ic', 'hand', 'capacitor'] as const) {
      expect(parts).toContain(part);
    }
  });
});

describe('namedPart', () => {
  const terms = proseTerms(HTML);

  it('finds the part a label begins with, ignoring case', () => {
    expect(namedPart('Glide wheel speed', terms)).toBe('rotor');
    expect(namedPart('IC: locked', terms)).toBe('ic');
    expect(namedPart('Hands vs true time', terms)).toBe('hand');
    expect(namedPart('Crystal, on screen', terms)).toBe('quartz');
  });

  it('prefers the longest term', () => {
    expect(namedPart('quartz crystal', terms)).toBe('quartz');
  });

  it('matches whole words only', () => {
    expect(namedPart('ICs', terms)).toBeNull();
    expect(namedPart('Handset', terms)).toBeNull();
  });

  it('ignores a part named later in the label, as the prose colours only the name', () => {
    expect(namedPart('the IC browns out', terms)).toBeNull();
    expect(namedPart('Speed, rev/s', terms)).toBeNull();
  });
});
