import { describe, expect, it } from 'vitest';
import {
  cyclesPerReferenceTick,
  cyclesPerStep,
  dividerChainHz,
  referenceHz,
  referencePhaseRad,
} from '../../src/sim/quartz.ts';
import { ROTOR_TARGET_REV_S } from '../../src/sim/params.ts';
import { P } from './helpers.ts';

describe('the quartz reference', () => {
  it('halves 32,768 Hz twelve times to the 8 Hz reference', () => {
    const chain = dividerChainHz(P);
    expect(chain).toHaveLength(13);
    expect(chain[0]).toBe(32768);
    expect(chain.at(-1)).toBe(8);
    for (let i = 1; i < chain.length; i++) expect(chain[i]).toBe(chain[i - 1]! / 2);
  });

  it('ticks once per intended glide wheel turn', () => {
    expect(referenceHz(P)).toBe(ROTOR_TARGET_REV_S);
  });

  it('counts 8 crystal cycles per step and 4,096 per tick, so ticks land on steps', () => {
    expect(cyclesPerStep(P)).toBe(8);
    expect(cyclesPerReferenceTick(P)).toBe(4096);
  });

  it('advances the reference one full turn per tick, from wherever it was aligned', () => {
    expect(referencePhaseRad(1, 4096 * 3, P)).toBeCloseTo(1 + 3 * 2 * Math.PI, 12);
  });

  it('keeps the reference exact after 72 hours of counting, since the count is an integer', () => {
    const cycles = 32768 * 72 * 3600;
    expect(Number.isSafeInteger(cycles)).toBe(true);
    const turns = referencePhaseRad(0, cycles, P) / (2 * Math.PI);
    // 2,073,600 turns; the only error is one rounding of the final multiply.
    expect(Math.abs(turns - 8 * 72 * 3600)).toBeLessThan(1e-9);
  });
});
