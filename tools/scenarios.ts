// The headless scenarios `npm run sim` can run. Each is a complete,
// reproducible run of the default movement (decision 2), in whichever mode
// suits its timescale: detailed for seconds, averaged for hours and days.

import { createAveragedState, runAveragedScenario } from '../src/sim/averaged.ts';
import { createState, runScenario } from '../src/sim/detailed.ts';
import { DEFAULT_PARAMS, SHOCK_DELTA_OMEGA_RAD_S } from '../src/sim/params.ts';
import { referenceHz } from '../src/sim/quartz.ts';
import type { Sample, SimParams } from '../src/sim/types.ts';
import { SECONDS_PER_HOUR } from '../src/sim/units.ts';

export interface ScenarioRun {
  mode: 'detailed' | 'averaged';
  params: SimParams;
  samples: Sample[];
}

export interface ScenarioDefinition {
  description: string;
  run: () => ScenarioRun;
}

const P = DEFAULT_PARAMS;

/** Detailed scenarios sample eight times a reference period: fine enough to see a lock or a shock settle. */
const DETAILED_SAMPLE_S = 1 / (8 * referenceHz(P));
/** Averaged scenarios sample once a minute: 1,441 rows a day. */
const AVERAGED_SAMPLE_S = 60;

function detailed(windFraction: number, brakeEnabled: boolean, durationS: number, shockTimesS: number[] = []) {
  return (): ScenarioRun => ({
    mode: 'detailed',
    params: P,
    samples: runScenario({
      params: P,
      initial: createState(P, { windFraction }),
      controls: { brakeEnabled },
      durationS,
      sampleIntervalS: DETAILED_SAMPLE_S,
      // Alternate the sign, so the loop is seen correcting a knock each way.
      shocks: shockTimesS.map((timeS, i) => ({ timeS, deltaOmegaRadS: (i % 2 ? -1 : 1) * SHOCK_DELTA_OMEGA_RAD_S })),
    }).samples,
  });
}

function averaged(windFraction: number, durationS: number) {
  return (): ScenarioRun => ({
    mode: 'averaged',
    params: P,
    samples: runAveragedScenario({
      params: P,
      initial: createAveragedState(P, { windFraction }),
      controls: { brakeEnabled: true },
      durationS,
      sampleIntervalS: AVERAGED_SAMPLE_S,
    }).samples,
  });
}

export const SCENARIOS: Readonly<Record<string, ScenarioDefinition>> = Object.freeze({
  'full-wind-lock': {
    description: 'Detailed, 30 s: the glide wheel let go from rest at full wind, locking to 8 rev/s (test 2).',
    run: detailed(1, true, 30),
  },
  runaway: {
    description: 'Detailed, 30 s: the same, with the brake disabled. It settles near 30.6 rev/s (test 1).',
    run: detailed(1, false, 30),
  },
  'rate-24h': {
    description: 'Averaged, 24 h from half wind: the rate while regulated (test 3).',
    run: averaged(0.5, 24 * SECONDS_PER_HOUR),
  },
  'rundown-72h': {
    description: 'Averaged, 76 h from full wind: regulation, its end, brownout, and the stall (test 4).',
    run: averaged(1, 76 * SECONDS_PER_HOUR),
  },
  shock: {
    description: 'Detailed, 30 s at full wind: a +2 rev/s knock at 10 s and a -2 rev/s knock at 20 s (test 6).',
    run: detailed(1, true, 30, [10, 20]),
  },
});

export const SCENARIO_NAMES: readonly string[] = Object.keys(SCENARIOS);
