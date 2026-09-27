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

// The divider chain's outputs, stage by stage. The IC's counter is a chain of
// binary dividers, each halving the frequency of the one before, so the
// outputs are the bits of the crystal's cycle count. The quartz widget draws
// them; the dynamics need only the count (above). PHYSICS.md, D11.

/**
 * Crystal cycles between one edge of a stage's output and the next. The
 * oscillator (stage 0) changes level twice a cycle; each divider after it
 * changes once for every two changes of the stage before, so stage j changes
 * every 2^(j−1) cycles.
 */
export function stageHalfPeriodCycles(stage: number): number {
  return stage === 0 ? 0.5 : 2 ** (stage - 1);
}

/**
 * The level, 0 or 1, of divider stage `stage` after `quartzCycles` cycles.
 * Stage 0 is the oscillator's squared output, low for the first half of each
 * cycle and high for the second, so it falls as each cycle completes. Each
 * divider toggles on a falling edge of the stage before it, which makes
 * stage j (j ≥ 1) bit j − 1 of the whole number of cycles counted. A
 * negative count, the crystal before the moment chosen as zero, continues
 * the same pattern backwards.
 */
export function stageLevel(quartzCycles: number, stage: number): 0 | 1 {
  const halves = Math.floor(quartzCycles / stageHalfPeriodCycles(stage));
  // Stage 0 is low in its first half; every divider is low in its first half-period too.
  return ((halves % 2) + 2) % 2 === 1 ? 1 : 0;
}

/**
 * Cycles counted since the last reference tick: the divider chain read as a
 * binary number, from 0 to 4,095. It returns to zero, every stage low at
 * once, as each tick is given.
 */
export function counterValue(quartzCycles: number, params: SimParams): number {
  const n = cyclesPerReferenceTick(params);
  return ((Math.floor(quartzCycles) % n) + n) % n;
}

/** Reference ticks given after `quartzCycles` cycles: one each time the counter rolls over. */
export function referenceTicks(quartzCycles: number, params: SimParams): number {
  return Math.floor(quartzCycles / cyclesPerReferenceTick(params));
}
