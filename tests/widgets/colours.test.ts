import { describe, expect, it } from 'vitest';
import { PART_IDS, THEMES } from '../../src/runtime/palette.ts';
import { ROLES, ROLE_IDS, colours, rolePart, type Role } from '../../src/widgets/shared/colours.ts';
import { namedPart, proseTerms } from '../prose.ts';

// Which part each drawn thing is coloured as (decision 40). The widgets take
// part colours only through this table, which lint enforces, so checking
// the table against the prose checks every widget at once.

describe('the colour roles', () => {
  it('give every role a part the palette defines', () => {
    for (const role of ROLE_IDS) expect(PART_IDS).toContain(ROLES[role]);
  });

  it('colour each role as its part, in both themes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const t = THEMES[scheme];
      const c = colours(t);
      for (const role of ROLE_IDS) expect(c[role]).toBe(t.parts[ROLES[role]]);
    }
  });

  it('build each theme’s table once, since widgets ask every frame', () => {
    expect(colours(THEMES.light)).toBe(colours(THEMES.light));
    expect(colours(THEMES.dark)).not.toBe(colours(THEMES.light));
  });

  it('give the DOM the same part as the canvas', () => {
    for (const role of ROLE_IDS) expect(THEMES.light.parts[rolePart(role)]).toBe(colours(THEMES.light)[role]);
  });

  // Each role that draws a part the prose names, with the words the prose
  // uses for it. If the article and the table ever disagree about whose
  // colour a thing is, this fails.
  const NAMED: Record<Exclude<Role, 'speed' | 'brake' | 'reference'>, string> = {
    glideWheel: 'glide wheel',
    hands: 'hands',
    mainspring: 'mainspring',
    coil: 'coil',
    supply: 'supply',
    crystal: 'quartz crystal',
    ic: 'IC',
  };

  for (const [role, words] of Object.entries(NAMED) as [Role, string][]) {
    it(`colour ${role} as the prose colours “${words}”`, () => {
      expect(namedPart(words, proseTerms())).toBe(ROLES[role]);
    });
  }

  it('colour a quantity as the part that produces it', () => {
    // The wheel's speed is the wheel's; the brake is the coil's, which does
    // the braking; the reference is the crystal's time, counted.
    expect(ROLES.speed).toBe(ROLES.glideWheel);
    expect(ROLES.brake).toBe(ROLES.coil);
    expect(ROLES.reference).toBe(ROLES.crystal);
  });

  it('leave the train’s colour to the train, which no widget draws, so friction is never mistaken for it', () => {
    expect(Object.values(ROLES)).not.toContain('train');
  });
});
