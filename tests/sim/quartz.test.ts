import { describe, expect, it } from 'vitest';
import {
  counterValue,
  cyclesPerReferenceTick,
  cyclesPerStep,
  dividerChainHz,
  referenceHz,
  referencePhaseRad,
  referenceTicks,
  stageHalfPeriodCycles,
  stageLevel,
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

describe('the divider chain, stage by stage (PHYSICS.md, D11)', () => {
  const STAGES = P.referenceDividerStages;

  /** Frequency of a stage's output measured by counting its rising edges over `cycles` crystal cycles. */
  function measuredHz(stage: number, cycles: number): number {
    // Sample four times per half-period of the oscillator, so no edge is missed.
    const dt = 0.125;
    let rising = 0;
    let prev = stageLevel(0, stage);
    for (let c = dt; c <= cycles; c += dt) {
      const level = stageLevel(c, stage);
      if (prev === 0 && level === 1) rising += 1;
      prev = level;
    }
    return (rising / cycles) * P.quartzHz;
  }

  it('gives each stage the frequency dividerChainHz states, measured by counting its edges over one second', () => {
    const chain = dividerChainHz(P);
    // A whole second of crystal cycles holds a whole number of periods of
    // every stage (8 of the slowest), so the counts are exact.
    for (let stage = 0; stage <= STAGES; stage++) expect(measuredHz(stage, P.quartzHz)).toBe(chain[stage]);
  });

  it('holds every output at a 50% duty cycle', () => {
    for (let stage = 0; stage <= STAGES; stage++) {
      let high = 0;
      const samples = 4096 * 8;
      for (let i = 0; i < samples; i++) high += stageLevel((i + 0.5) / 8, stage);
      expect(high / samples).toBe(0.5);
    }
  });

  it('toggles each divider on a falling edge of the stage before it, and never otherwise', () => {
    // Walk through two reference periods in steps finer than any edge.
    const dt = 0.25;
    for (let stage = 1; stage <= STAGES; stage++) {
      let prevIn = stageLevel(0, stage - 1);
      let prevOut = stageLevel(0, stage);
      for (let c = dt; c <= 8192; c += dt) {
        const input = stageLevel(c, stage - 1);
        const out = stageLevel(c, stage);
        const fell = prevIn === 1 && input === 0;
        expect(out !== prevOut).toBe(fell);
        prevIn = input;
        prevOut = out;
      }
    }
  });

  it('reads the divider outputs as the bits of the cycle count', () => {
    for (const n of [0, 1, 2, 3, 1234, 2047, 2048, 4095, 4096, 99_999]) {
      const bits = Array.from({ length: STAGES }, (_, j) => stageLevel(n + 0.25, j + 1) * 2 ** j);
      expect(bits.reduce((a, b) => a + b, 0)).toBe(n % 4096);
      expect(counterValue(n + 0.25, P)).toBe(n % 4096);
    }
  });

  it('rolls the counter over, every stage low at once, as each reference tick is given', () => {
    for (const tick of [1, 2, 8, 1000]) {
      const c = tick * 4096;
      expect(referenceTicks(c - 0.25, P)).toBe(tick - 1);
      expect(referenceTicks(c, P)).toBe(tick);
      expect(counterValue(c - 0.25, P)).toBe(4095);
      expect(counterValue(c, P)).toBe(0);
      for (let stage = 1; stage <= STAGES; stage++) {
        expect(stageLevel(c - 0.25, stage)).toBe(1);
        expect(stageLevel(c, stage)).toBe(0);
      }
    }
  });

  it('gives eight reference ticks a second, as referenceHz says', () => {
    expect(referenceTicks(P.quartzHz, P)).toBe(referenceHz(P));
    expect(referenceTicks(P.quartzHz * 72 * 3600, P)).toBe(8 * 72 * 3600);
  });

  it('halves the half-period stage by stage, from half a cycle to 2,048 cycles at the reference', () => {
    expect(stageHalfPeriodCycles(0)).toBe(0.5);
    for (let stage = 1; stage <= STAGES; stage++)
      expect(stageHalfPeriodCycles(stage)).toBe(2 * stageHalfPeriodCycles(stage - 1));
    expect(stageHalfPeriodCycles(STAGES)).toBe(2048);
  });

  it('continues the pattern backwards for a count before zero, so a window reaching into the past is filled', () => {
    for (let stage = 0; stage <= STAGES; stage++) {
      const h = stageHalfPeriodCycles(stage);
      // One whole period earlier is the same level.
      for (const c of [-0.1, -1.3, -700.6, -5000.2]) expect(stageLevel(c, stage)).toBe(stageLevel(c + 2 * h, stage));
    }
    expect(counterValue(-1, P)).toBe(4095);
    expect(referenceTicks(-1, P)).toBe(-1);
  });
});
