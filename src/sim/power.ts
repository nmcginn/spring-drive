// The power supply: a capacitor charged by the generator and drained by the
// IC, which draws constant power while it runs (PHYSICS.md, step 5):
// C·dV/dt = i_charge − P_ic/V. The IC stops below its brownout voltage and
// restarts only once the capacitor has recovered to a higher start voltage.
// That gap is what keeps it from chattering on and off as the spring dies.

import type { SimParams } from './types.ts';

/** Whether the IC runs after this step, given whether it ran before and the supply now. */
export function nextIcOn(icOn: boolean, capVoltageV: number, params: SimParams): boolean {
  return icOn ? capVoltageV >= params.icBrownoutV : capVoltageV >= params.icStartV;
}

/** Current the running IC draws, A. */
export function icCurrentA(icOn: boolean, capVoltageV: number, params: SimParams): number {
  return icOn && capVoltageV > 0 ? params.icPowerW / capVoltageV : 0;
}

/** Capacitor voltage after one step of `dtS`, V. Never below zero. */
export function nextCapVoltageV(
  capVoltageV: number,
  chargeA: number,
  loadA: number,
  dtS: number,
  params: SimParams,
): number {
  return Math.max(0, capVoltageV + ((chargeA - loadA) / params.capacitanceF) * dtS);
}

/** Energy held in the capacitor, J. */
export function capEnergyJ(capVoltageV: number, params: SimParams): number {
  return 0.5 * params.capacitanceF * capVoltageV * capVoltageV;
}
