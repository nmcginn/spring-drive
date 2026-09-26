import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as params from '../../src/sim/params.ts';

// PHYSICS.md is the source of truth for every constant in params.ts. These
// tests make that mechanical: a constant without a row, a row without a
// constant, a missing label, or a value that disagrees with the code fails
// here rather than waiting for review.

const physics = readFileSync(join(import.meta.dirname, '..', '..', 'PHYSICS.md'), 'utf8');

interface Row {
  name: string;
  value: string;
  label: string;
}

/** Table rows whose second column is a backticked UPPER_SNAKE constant name. */
function parameterRows(markdown: string): Row[] {
  const rows: Row[] = [];
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // A row `| a | b | c |` splits to ['', a, b, c, ''].
    const match = /^`([A-Z][A-Z0-9_]*)`$/.exec(cells[2] ?? '');
    if (!match) continue;
    rows.push({ name: match[1]!, value: cells[3] ?? '', label: cells[5] ?? '' });
  }
  return rows;
}

const SUPERSCRIPT: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '-',
};

/**
 * Parse a value as PHYSICS.md writes it ("296,228.6", "1.0 × 10⁻¹⁰") into
 * the number and the half-width of its last shown digit, which is how far
 * the code's value may be from it and still round to what the table says.
 */
function parseShown(text: string): { value: number; halfUlp: number } | null {
  const match = /^([0-9][0-9,]*(?:\.[0-9]+)?)(?: × 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))?$/.exec(text);
  if (!match) return null;
  const mantissa = match[1]!.replaceAll(',', '');
  const exponent = match[2] ? Number([...match[2]].map((c) => SUPERSCRIPT[c]).join('')) : 0;
  const decimals = mantissa.includes('.') ? mantissa.split('.')[1]!.length : 0;
  return { value: Number(mantissa) * 10 ** exponent, halfUlp: 0.5 * 10 ** (exponent - decimals) };
}

const rows = parameterRows(physics);
const byName = new Map(rows.map((r) => [r.name, r]));

/** Exports that are physical constants or model choices: numbers, and tables of numbers. */
const constants = Object.entries(params).filter(([, v]) => typeof v === 'number' || Array.isArray(v));

describe('PHYSICS.md and params.ts', () => {
  it('finds the parameter tables at all, so an empty parse cannot pass the checks below', () => {
    expect(rows.length).toBeGreaterThan(20);
    expect(constants.length).toBeGreaterThan(20);
  });

  it.each(constants.map(([name]) => name))('has a row for %s', (name) => {
    expect(byName.has(name), `${name} is exported from params.ts but has no PHYSICS.md row`).toBe(true);
  });

  it('names only constants that exist, so a renamed constant cannot leave a stale row', () => {
    const exported = new Set(constants.map(([name]) => name));
    for (const row of rows) expect(exported, `PHYSICS.md row for ${row.name}`).toContain(row.name);
  });

  it('has exactly one row per constant', () => {
    expect(new Set(rows.map((r) => r.name)).size).toBe(rows.length);
  });

  it.each(rows.map((r) => [r.name, r.label]))('labels %s as published, derived, or assumption', (_name, label) => {
    expect(['Published', 'Derived', 'Assumption']).toContain(label);
  });

  it.each(constants.filter(([, v]) => typeof v === 'number'))(
    'agrees with params.ts on %s, to every digit PHYSICS.md shows',
    (name, value) => {
      const shown = parseShown(byName.get(name)?.value ?? '');
      expect(shown, `PHYSICS.md value for ${name} is not a plain number`).not.toBeNull();
      // Half a unit in the last shown digit is exactly the rounding the table
      // is allowed; the 1e-12 relative term only absorbs float noise in
      // values like 0.1 × 10⁻⁶ that are not exact in binary.
      const tolerance = shown!.halfUlp + 1e-12 * Math.abs(value as number);
      expect(Math.abs((value as number) - shown!.value)).toBeLessThanOrEqual(tolerance);
    },
  );

  it('prints the mainspring torque curve point for point, as params.ts defines it', () => {
    const section = physics.split('### Mainspring torque curve')[1]?.split('\n## ')[0] ?? '';
    const points = [...section.matchAll(/^\| ([0-9.]+) \| ([0-9.]+) \|$/gm)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(points).toEqual(params.MAINSPRING_TORQUE_CURVE.map(([x, t]) => [x, t]));
  });

  it('builds DEFAULT_PARAMS only from named constants, so no number can skip its row', () => {
    const exportedValues = new Set<unknown>(constants.map(([, v]) => v));
    for (const [field, value] of Object.entries(params.DEFAULT_PARAMS)) {
      expect(exportedValues.has(value), `DEFAULT_PARAMS.${field} is not an exported constant`).toBe(true);
    }
  });
});

describe('the value parser the checks above rely on', () => {
  it('reads plain, grouped, and scientific values with the precision they show', () => {
    expect(parseShown('8')).toEqual({ value: 8, halfUlp: 0.5 });
    expect(parseShown('296,228.6')).toEqual({ value: 296228.6, halfUlp: 0.05 });
    const sci = parseShown('1.6 × 10⁻¹⁰')!;
    expect(sci.value).toBeCloseTo(1.6e-10, 20);
    expect(sci.halfUlp).toBeCloseTo(0.05e-10, 20);
  });

  it('rejects anything that is not a plain number, so a prose value cannot hide a mismatch', () => {
    expect(parseShown('see table')).toBeNull();
    expect(parseShown('about 8')).toBeNull();
  });
});
