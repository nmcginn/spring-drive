// Measures over a run, shared by the physics tests, the CLI (M2), and any
// widget that shows a lock indicator. What "locked" means is a model choice,
// stated in PHYSICS.md, so it is defined once here, from params.

import { LOCK_PHASE_TOLERANCE_RAD, LOCK_SPEED_TOLERANCE } from './params.ts';
import type { Sample, SimParams } from './types.ts';
import { SECONDS_PER_DAY } from './units.ts';

/** Mean glide wheel speed between two samples, rad/s. */
export function meanOmegaRadS(from: Sample, to: Sample): number {
  return (to.rotorAngleRad - from.rotorAngleRad) / (to.timeS - from.timeS);
}

/**
 * Whether the glide wheel is locked over the interval ending at `to`: the IC
 * is running, the mean speed since `from` is within LOCK_SPEED_TOLERANCE of
 * the target, and the phase error at `to` is within LOCK_PHASE_TOLERANCE_RAD.
 * Meant for samples one reference period apart, so the mean speed is the
 * speed the IC itself would measure.
 */
export function isLocked(from: Sample, to: Sample, params: SimParams): boolean {
  const speedError = meanOmegaRadS(from, to) / params.rotorTargetOmegaRadS - 1;
  return (
    to.icOn && Math.abs(speedError) <= LOCK_SPEED_TOLERANCE && Math.abs(to.phaseErrorRad) <= LOCK_PHASE_TOLERANCE_RAD
  );
}

/**
 * The time lock is gained and then held to the end of the samples, s, or
 * null if the run ends unlocked. Samples after `afterS` only, so a test can
 * ask how long lock takes to come back after a shock.
 */
export function lockTimeS(samples: readonly Sample[], params: SimParams, afterS = 0): number | null {
  let lockedSince: number | null = null;
  let from: Sample | undefined;
  for (const to of samples) {
    if (from && to.timeS > afterS) {
      if (isLocked(from, to, params)) lockedSince ??= to.timeS;
      else lockedSince = null;
    }
    from = to;
  }
  return lockedSince;
}

/**
 * The watch's rate between two samples, s/day: how much the time the hands
 * show gained (positive) or lost against true time, per day. The hands are
 * geared to the glide wheel, so they show the time the wheel has turned
 * through at the target speed.
 */
export function rateErrorSPerDay(from: Sample, to: Sample, params: SimParams): number {
  const elapsedS = to.timeS - from.timeS;
  const shownS = (to.rotorAngleRad - from.rotorAngleRad) / params.rotorTargetOmegaRadS;
  return ((shownS - elapsedS) / elapsedS) * SECONDS_PER_DAY;
}
