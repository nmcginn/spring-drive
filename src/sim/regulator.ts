// The regulator: a model of the principle, not the 9R's firmware, which is
// not public (decision 6). At every reference tick it measures how far the
// glide wheel is ahead of the reference (positive) or behind it, and sets the
// brake duty with a PI law, clamped to [0, 1]. The update runs once per
// reference tick, 8 times a second, clocked by the crystal (decision 19).

import type { SimParams } from './types.ts';
import { referenceHz } from './quartz.ts';

export interface RegulatorOutput {
  integralRadS: number;
  duty: number;
}

/**
 * One controller update. Anti-windup by conditional integration: when the
 * duty is already pinned at 0 or 1 and the new error would push it further,
 * the integral is left alone, so a long spin-up or a heavy shock does not
 * leave a debt the loop then overshoots to repay.
 */
export function regulatorUpdate(
  integralRadS: number,
  phaseErrorRad: number,
  previousPhaseErrorRad: number,
  params: SimParams,
): RegulatorOutput {
  const periodS = 1 / referenceHz(params);
  const speedErrorRadS = (phaseErrorRad - previousPhaseErrorRad) / periodS;
  const duty = (integral: number) =>
    params.regulatorKpPerRad * phaseErrorRad +
    params.regulatorKiPerRadS * integral +
    params.regulatorKdPerRadS * speedErrorRadS;
  const integrated = integralRadS + phaseErrorRad * periodS;
  const raw = duty(integrated);
  const windingUp = (raw > 1 && phaseErrorRad > 0) || (raw < 0 && phaseErrorRad < 0);
  const integral = windingUp ? integralRadS : integrated;
  return { integralRadS: integral, duty: clampDuty(duty(integral)) };
}

function clampDuty(duty: number): number {
  return Math.min(1, Math.max(0, duty));
}
