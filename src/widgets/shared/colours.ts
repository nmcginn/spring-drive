// What each thing a widget draws is coloured as. The palette says what colour
// each part is; this says which part each drawn thing belongs to, once, so a
// quantity is the same colour in every widget and in the prose that names it
// (decision 40). Widgets take part colours only from here: lint stops any
// other widget module reading `theme.parts` directly.
//
// The rule behind the table: a thing takes the colour of the part it belongs
// to, and a quantity the colour of the part that produces it. Anything that
// belongs to no one part (friction, true time, grids, axes, playback) is
// drawn in the UI's neutral tokens, never a part colour, so a part colour
// always means that part.

import type { PartId, Theme } from '../../runtime/palette.ts';

export const ROLES = {
  /** The glide wheel itself: its rim, its magnet, its arbor, and its name. */
  glideWheel: 'rotor',
  /** The glide wheel's speed, as a trace, a bar, or a readout. */
  speed: 'rotor',
  /** Every hand that tells a watch's time, seconds hands included, and the arbor they turn on. */
  hands: 'hand',
  /** The mainspring: how far it is wound, and the power reserve that reads it. */
  mainspring: 'mainspring',
  /** The coil, its EMF, its current, and whether it is shorted. */
  coil: 'coil',
  /** The brake: its torque, its duty, and its share of the power. The coil does the braking. */
  brake: 'coil',
  /** The capacitor's voltage, the supply, and the electricity that charges it. */
  supply: 'capacitor',
  /** The quartz crystal. */
  crystal: 'quartz',
  /**
   * The reference and whatever it sets: the 8 Hz tick, the 8 rev/s it asks
   * of the wheel, and zero phase error. It is the crystal's time, counted, so
   * it takes the crystal's colour, even as the last stage of the IC's divider.
   */
  reference: 'quartz',
  /** What the IC does: its divider stages, the phase error it measures, its state, and its brownout. */
  ic: 'ic',
} as const satisfies Record<string, PartId>;

export type Role = keyof typeof ROLES;

export const ROLE_IDS = Object.keys(ROLES) as Role[];

export type RoleColours = Readonly<Record<Role, string>>;

// Widgets ask every frame, and a theme is one of two fixed objects, so each
// theme's table is built once.
const cache = new WeakMap<Theme, RoleColours>();

/** The colour of every role in theme `t`. */
export function colours(t: Theme): RoleColours {
  let table = cache.get(t);
  if (!table) {
    table = Object.fromEntries(ROLE_IDS.map((role) => [role, t.parts[ROLES[role]]])) as Record<Role, string>;
    cache.set(t, table);
  }
  return table;
}

/** The part a role belongs to, for the DOM, where `.part[data-part]` colours it as the prose is coloured. */
export function rolePart(role: Role): PartId {
  return ROLES[role];
}
