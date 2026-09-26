import { describe, expect, it } from 'vitest';
import { createAveragedState, runAveragedScenario } from '../../src/sim/averaged.ts';
import { windFraction } from '../../src/sim/mainspring.ts';
import { rateErrorSPerDay } from '../../src/sim/metrics.ts';
import { RATED_ACCURACY_S_PER_DAY } from '../../src/sim/params.ts';
import { SECONDS_PER_DAY, SECONDS_PER_HOUR } from '../../src/sim/units.ts';
import { P } from './helpers.ts';

// Test 3 (PLAN.md): averaged mode over 24 h at mid wind yields a rate error
// within ±0.5 s/day. PHYSICS.md, Model predictions, says what the model
// actually predicts: zero, because its crystal is exact and the regulator
// holds zero phase error against it. The published ±15 s/month comes from
// things the model leaves out, such as the crystal's own frequency error.

const { samples, regimes, final } = runAveragedScenario({
  params: P,
  initial: createAveragedState(P, { windFraction: 0.5 }),
  controls: { brakeEnabled: true },
  durationS: SECONDS_PER_DAY,
  sampleIntervalS: SECONDS_PER_HOUR,
});

// Rounding only: the glide wheel's angle is a sum of 86,400 one-second
// turns of 50.27 rad, which reaches 4.3 × 10⁶ rad, where a double's spacing
// is about 10⁻⁹ rad. A day of that rounding is far below 10⁻⁶ s/day.
const FLOAT_S_PER_DAY = 1e-6;

describe('test 3: rate', () => {
  it('keeps time within the rated ±0.5 s/day over 24 h from half wind', () => {
    expect(Math.abs(rateErrorSPerDay(samples[0]!, samples.at(-1)!, P))).toBeLessThanOrEqual(RATED_ACCURACY_S_PER_DAY);
  });

  it('keeps time exactly, to float rounding, as PHYSICS.md predicts for an exact crystal', () => {
    expect(Math.abs(rateErrorSPerDay(samples[0]!, samples.at(-1)!, P))).toBeLessThan(FLOAT_S_PER_DAY);
  });

  it('keeps that rate in every hour of the day, not just on average', () => {
    for (let i = 1; i < samples.length; i++) {
      expect(Math.abs(rateErrorSPerDay(samples[i - 1]!, samples[i]!, P))).toBeLessThan(FLOAT_S_PER_DAY);
    }
  });

  it('stays regulated all day, as the spring runs from half wind down to a sixth', () => {
    expect(samples).toHaveLength(25);
    expect(regimes.every((r) => r === 'regulated')).toBe(true);
    // A day is exactly a third of the 72 h the gear ratio is cut for (D1).
    // 10⁻¹¹: float rounding in the barrel angle, which moves by 10⁻⁴ rad a step.
    expect(Math.abs(windFraction(final.barrelAngleRad, P) - (0.5 - 24 / 72))).toBeLessThan(1e-11);
  });

  it('brakes less as the spring weakens: the duty falls from the 0.071 PHYSICS.md derives at half wind', () => {
    // 0.5%: the derived duty is rounded to three decimals in PHYSICS.md.
    expect(Math.abs(samples[0]!.duty / 0.071 - 1)).toBeLessThan(0.005);
    for (let i = 1; i < samples.length; i++) expect(samples[i]!.duty).toBeLessThan(samples[i - 1]!.duty);
  });
});
