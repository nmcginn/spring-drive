import { describe, expect, it } from 'vitest';
import { createState, runScenario } from '../../src/sim/detailed.ts';
import { SHOCK_DELTA_OMEGA_RAD_S } from '../../src/sim/params.ts';
import { randomShocks } from '../../src/sim/shocks.ts';
import type { Scenario } from '../../src/sim/types.ts';
import { P, REFERENCE_PERIOD_S } from './helpers.ts';

// Test 8 (PLAN.md): the same params and seed produce identical output, to
// the bit. Shocks from the seeded RNG are the only randomness in the sim.

function scenario(seed: number): Scenario {
  return {
    params: P,
    initial: createState(P, { windFraction: 0.8 }),
    controls: { brakeEnabled: true },
    durationS: 20,
    sampleIntervalS: REFERENCE_PERIOD_S,
    shocks: randomShocks(seed, 20, 6, SHOCK_DELTA_OMEGA_RAD_S),
  };
}

describe('test 8: determinism', () => {
  it('produces bit-identical samples and final state from the same params and seed', () => {
    expect(runScenario(scenario(42))).toStrictEqual(runScenario(scenario(42)));
  });

  it('produces different output from a different seed, so the seed really reaches the run', () => {
    const a = runScenario(scenario(42)).final.rotorAngleRad;
    const b = runScenario(scenario(43)).final.rotorAngleRad;
    expect(a).not.toBe(b);
  });

  it('does not depend on how the run is split: one 20 s run equals two 10 s runs back to back', () => {
    const whole = runScenario({ ...scenario(1), shocks: [] }).final;
    const first = runScenario({ ...scenario(1), shocks: [], durationS: 10 }).final;
    const second = runScenario({ ...scenario(1), shocks: [], durationS: 10, initial: first }).final;
    // Time is derived from the step count, which restarts per run, so compare the physics.
    expect(second.rotorAngleRad).toBe(whole.rotorAngleRad);
    expect(second.capVoltageV).toBe(whole.capVoltageV);
    expect(second.regulator).toStrictEqual(whole.regulator);
  });
});
