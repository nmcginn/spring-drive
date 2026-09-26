// Scenario samples as CSV. Every column is named with its unit (decision 24),
// so a file can be read without the source: `omega_rad_s` is rad/s, `v_cap_V`
// is volts, `_fraction` is dimensionless from 0 to 1, and `_flag` is 0 or 1.

import { windFraction } from '../src/sim/mainspring.ts';
import type { Sample, SimParams } from '../src/sim/types.ts';
import { radSToRevS } from '../src/sim/units.ts';

interface Column {
  name: string;
  value: (s: Sample, params: SimParams) => number;
}

export const CSV_COLUMNS: readonly Column[] = [
  { name: 'time_s', value: (s) => s.timeS },
  { name: 'rotor_angle_rad', value: (s) => s.rotorAngleRad },
  { name: 'omega_rad_s', value: (s) => s.rotorOmegaRadS },
  { name: 'omega_rev_s', value: (s) => radSToRevS(s.rotorOmegaRadS) },
  // What the hands show minus true time: the glide wheel's angle read at the
  // target speed, against the clock. Every scenario starts the wheel at 0 rad.
  { name: 'hand_error_s', value: (s, p) => s.rotorAngleRad / p.rotorTargetOmegaRadS - s.timeS },
  { name: 'barrel_angle_rad', value: (s) => s.barrelAngleRad },
  { name: 'wind_fraction', value: (s, p) => windFraction(s.barrelAngleRad, p) },
  { name: 'v_cap_V', value: (s) => s.capVoltageV },
  { name: 'ic_on_flag', value: (s) => (s.icOn ? 1 : 0) },
  { name: 'brake_duty_fraction', value: (s) => s.duty },
  { name: 'phase_error_rad', value: (s) => s.phaseErrorRad },
];

/** Header and one row per sample, each number written in full so it reads back to the bit. */
export function samplesToCsv(samples: readonly Sample[], params: SimParams): string {
  const lines = [CSV_COLUMNS.map((c) => c.name).join(',')];
  for (const s of samples) lines.push(CSV_COLUMNS.map((c) => String(c.value(s, params))).join(','));
  return lines.join('\n') + '\n';
}
