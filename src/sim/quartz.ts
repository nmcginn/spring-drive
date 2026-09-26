// The quartz reference: a 32,768 Hz crystal, halved by a chain of binary
// dividers down to one tick per intended glide wheel turn. The IC counts
// crystal cycles, so the reference phase is an integer count, and it never
// accumulates floating-point drift however long it runs.

import type { SimParams } from './types.ts';
import { TAU } from './units.ts';

/** The frequency at the output of each divider stage, crystal first, Hz. */
export function dividerChainHz(params: SimParams): number[] {
  const chain: number[] = [];
  for (let stage = 0; stage <= params.referenceDividerStages; stage++) chain.push(params.quartzHz / 2 ** stage);
  return chain;
}

/** Reference tick rate at the end of the chain, Hz. */
export function referenceHz(params: SimParams): number {
  return params.quartzHz / 2 ** params.referenceDividerStages;
}

/** Crystal cycles per reference tick. */
export function cyclesPerReferenceTick(params: SimParams): number {
  return 2 ** params.referenceDividerStages;
}

/**
 * Crystal cycles per detailed-mode step. The step must be a whole number of
 * cycles, or reference ticks would fall between steps; `validateParams`
 * checks it.
 */
export function cyclesPerStep(params: SimParams): number {
  return params.quartzHz * params.stepS;
}

/** Reference phase after counting `quartzCycles` from `originRad`, rad. */
export function referencePhaseRad(originRad: number, quartzCycles: number, params: SimParams): number {
  return originRad + (TAU * quartzCycles) / cyclesPerReferenceTick(params);
}
