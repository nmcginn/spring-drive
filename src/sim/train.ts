// The going train between barrel and glide wheel. It divides speed by the
// gear ratio on the way up, and torque by it on the way down, losing a fixed
// fraction of the power to mesh friction on the way (PHYSICS.md, step 1).
// The train's own inertia is folded into the glide wheel's: reflected through
// a ratio this large, only the wheel next to the glide wheel contributes
// anything, and the rotor inertia assumption already covers it.

import type { SimParams } from './types.ts';

/** Torque the barrel delivers at the glide wheel, N·m. */
export function reflectedDriveTorqueNm(barrelTorqueNm: number, params: SimParams): number {
  return (barrelTorqueNm * params.trainEfficiency) / params.gearRatio;
}

/** Barrel angle the glide wheel consumes by turning through `rotorAngleRad`. */
export function barrelAngleForRotorRad(rotorAngleRad: number, params: SimParams): number {
  return rotorAngleRad / params.gearRatio;
}
