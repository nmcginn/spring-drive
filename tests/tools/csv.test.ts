import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS as P } from '../../src/sim/params.ts';
import type { Sample } from '../../src/sim/types.ts';
import { CSV_COLUMNS, samplesToCsv } from '../../tools/csv.ts';

// The CSVs must be readable without the source (the M2 acceptance criteria),
// so every column name carries its unit, and every value reads back exactly.

const UNIT_SUFFIXES = ['_s', '_rad', '_rad_s', '_rev_s', '_V', '_fraction', '_flag'];

const sample: Sample = {
  timeS: 1.5,
  rotorAngleRad: 75.39822368615503,
  rotorOmegaRadS: 50.26548245743669,
  barrelAngleRad: 21.991148575128552,
  capVoltageV: 0.7964660658987964,
  icOn: true,
  duty: 0.1117928091767419,
  phaseErrorRad: -0.0001,
};

describe('scenario CSV', () => {
  it.each(CSV_COLUMNS.map((c) => c.name))('names column %s with its unit', (name) => {
    expect(
      UNIT_SUFFIXES.some((suffix) => name.endsWith(suffix)),
      name,
    ).toBe(true);
  });

  it('has unique column names in snake case (units keep their SI capital, as in v_cap_V)', () => {
    const names = CSV_COLUMNS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z_]*(_V)?$/);
  });

  it('writes a header and one row per sample, ending in a newline', () => {
    const lines = samplesToCsv([sample, sample], P).split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(CSV_COLUMNS.map((c) => c.name).join(','));
    expect(lines[3]).toBe('');
  });

  it('writes every value so it reads back to the bit', () => {
    const [header, row] = samplesToCsv([sample], P).split('\n');
    const values = Object.fromEntries(header!.split(',').map((name, i) => [name, Number(row!.split(',')[i])]));
    expect(values.time_s).toBe(sample.timeS);
    expect(values.rotor_angle_rad).toBe(sample.rotorAngleRad);
    expect(values.omega_rad_s).toBe(sample.rotorOmegaRadS);
    expect(values.v_cap_V).toBe(sample.capVoltageV);
    expect(values.brake_duty_fraction).toBe(sample.duty);
    expect(values.phase_error_rad).toBe(sample.phaseErrorRad);
    expect(values.ic_on_flag).toBe(1);
  });

  it('derives the readable columns: rev/s, wind fraction, and what the hands show against true time', () => {
    const [header, row] = samplesToCsv([sample], P).split('\n');
    const values = Object.fromEntries(header!.split(',').map((name, i) => [name, Number(row!.split(',')[i])]));
    expect(values.omega_rev_s).toBeCloseTo(8, 12);
    expect(values.wind_fraction).toBeCloseTo(0.5, 12);
    // 1.5 turns of the wheel at 8 rev/s is 0.1875 s shown, 1.3125 s behind the clock.
    expect(values.hand_error_s).toBeCloseTo(75.39822368615503 / P.rotorTargetOmegaRadS - 1.5, 12);
  });
});
