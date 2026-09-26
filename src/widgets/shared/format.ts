// Readout formatting shared by every widget. Pure functions, so each unit
// and rounding rule is tested once (tests/widgets/format.test.ts).

/**
 * A narrow no-break space (U+202F) joins a value to its unit, as SI style
 * asks, and stops a readout wrapping between the two at 380 px.
 */
export const UNIT_SPACE = '\u202f';

/** A real minus sign, which lines up with digits in a monospace readout. */
const MINUS = '\u2212';

/** A value with a fixed number of decimals and its unit: "30.6 rev/s". */
export function withUnit(value: number, decimals: number, unit: string): string {
  // -0 would print as "-0.0"; so would a tiny negative that rounds to zero.
  const text = value.toFixed(decimals);
  const clean = Number(text) === 0 ? (0).toFixed(decimals) : text;
  return `${clean.replace('-', MINUS)}${UNIT_SPACE}${unit}`;
}

/**
 * A span of time as a reader would say it, with units on every part. Under a
 * minute: "42.5 s". Under an hour: "3 min 07 s". After that: "28 h 57 min".
 * Whole seconds and minutes are floored, as a clock's are, so the display
 * never shows a second that has not yet passed.
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 60) return withUnit(Math.floor(s * 10) / 10, 1, 's');
  const pad = (n: number) => String(n).padStart(2, '0');
  const total = Math.floor(s);
  if (total < 3600) return `${Math.floor(total / 60)}${UNIT_SPACE}min ${pad(total % 60)}${UNIT_SPACE}s`;
  return `${Math.floor(total / 3600)}${UNIT_SPACE}h ${pad(Math.floor(total / 60) % 60)}${UNIT_SPACE}min`;
}

/** A ratio to a reference, with the multiplication sign as its unit: "3.82×". */
export function formatRatio(ratio: number, decimals = 2): string {
  return `${ratio.toFixed(decimals)}×`;
}

/** A fraction from 0 to 1 as a percentage: "99.9 %". */
export function formatPercent(fraction: number, decimals = 1): string {
  return withUnit(fraction * 100, decimals, '%');
}
