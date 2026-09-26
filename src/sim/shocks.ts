// Shocks scattered through a scenario by the seeded RNG: the wrist knocks a
// worn watch takes. Each is an instant change in glide wheel speed, of
// either sign, up to a given size. The same seed gives the same shocks,
// which is what makes a run with shocks reproducible (test 8).

import { createRng } from './rng.ts';
import type { Shock } from './types.ts';

export function randomShocks(seed: number, durationS: number, count: number, maxDeltaOmegaRadS: number): Shock[] {
  const rng = createRng(seed);
  const shocks: Shock[] = [];
  for (let i = 0; i < count; i++) {
    shocks.push({ timeS: rng() * durationS, deltaOmegaRadS: (2 * rng() - 1) * maxDeltaOmegaRadS });
  }
  return shocks.sort((a, b) => a.timeS - b.timeS);
}
