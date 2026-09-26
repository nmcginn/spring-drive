// Shared scaffolding for the physics tests: run the default movement from a
// given wind, sampled once per reference period, which is how lock is judged.

import { createState, runScenario } from '../../src/sim/detailed.ts';
import { DEFAULT_PARAMS } from '../../src/sim/params.ts';
import { referenceHz } from '../../src/sim/quartz.ts';
import type { Shock, SimParams } from '../../src/sim/types.ts';
import { TAU } from '../../src/sim/units.ts';

export const P: SimParams = DEFAULT_PARAMS;
export const REFERENCE_PERIOD_S = 1 / referenceHz(P);

export interface RunOptions {
  windFraction?: number;
  brakeEnabled?: boolean;
  durationS: number;
  shocks?: Shock[];
  sampleIntervalS?: number;
}

export function run(opts: RunOptions) {
  return runScenario({
    params: P,
    initial: createState(P, { windFraction: opts.windFraction ?? 1 }),
    controls: { brakeEnabled: opts.brakeEnabled ?? true },
    durationS: opts.durationS,
    sampleIntervalS: opts.sampleIntervalS ?? REFERENCE_PERIOD_S,
    shocks: opts.shocks ?? [],
  });
}

export const revS = (omegaRadS: number) => omegaRadS / TAU;
