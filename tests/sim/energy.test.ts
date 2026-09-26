import { describe, expect, it } from 'vitest';
import { createState, runScenario, storedEnergyJ } from '../../src/sim/detailed.ts';
import { windFraction } from '../../src/sim/mainspring.ts';
import { SHOCK_DELTA_OMEGA_RAD_S } from '../../src/sim/params.ts';
import { randomShocks } from '../../src/sim/shocks.ts';
import type { Shock } from '../../src/sim/types.ts';
import { P } from './helpers.ts';

// Test 5 (PLAN.md): spring energy spent equals dissipation plus IC
// consumption plus the change in kinetic energy (and, here, in capacitor
// energy, and minus what shocks added). Every ledger term is booked from its
// own formula at every step, so this checks that no energy path is missing
// or double-counted.
//
// Tolerance: 1 part in 10⁵. Mechanical terms are booked at each step's mean
// speed, the drive at its end speed, and the electrical terms at its start
// speed, so each step leaves a residue of order dt·Δω, which largely cancels
// over a run. Measured residues are 1e-7 to 3e-6 of the energy in; the
// tolerance is a few times the largest.

const TOLERANCE = 1e-5;

function balance(
  windFraction: number,
  brakeEnabled: boolean,
  durationS: number,
  shocks: Shock[] = [],
  rotorOmegaRadS = 0,
) {
  const initial = createState(P, { windFraction, rotorOmegaRadS });
  const { final } = runScenario({
    params: P,
    initial,
    controls: { brakeEnabled },
    durationS,
    sampleIntervalS: durationS,
    shocks,
  });
  const before = storedEnergyJ(initial, P);
  const after = storedEnergyJ(final, P);
  const e = final.energy;
  const inJ = e.springJ + e.shockJ;
  const outJ =
    e.trainLossJ +
    e.frictionJ +
    e.coilJ +
    e.rectifierJ +
    e.icJ +
    (after.kineticJ - before.kineticJ) +
    (after.capJ - before.capJ);
  return { inJ, outJ, final, springDrop: before.springJ - after.springJ };
}

describe('test 5: energy accounting', () => {
  it.each([
    ['a minute of regulation from rest at full wind', 1, true, 60],
    ['half a minute of runaway at full wind', 1, false, 30],
    ['two minutes of a spring too weak to regulate or power the IC', 0.01, true, 120],
  ] as const)('balances over %s', (_name, wind, brake, seconds) => {
    const { inJ, outJ } = balance(wind, brake, seconds);
    expect(inJ).toBeGreaterThan(0);
    expect(Math.abs(inJ - outJ) / inJ).toBeLessThan(TOLERANCE);
  });

  it('balances through a minute of random shocks, counting the energy the shocks add or remove', () => {
    const { inJ, outJ, final } = balance(0.5, true, 60, randomShocks(7, 60, 10, SHOCK_DELTA_OMEGA_RAD_S));
    expect(final.energy.shockJ).not.toBe(0);
    expect(Math.abs(inJ - outJ) / inJ).toBeLessThan(TOLERANCE);
  });

  it('balances through a run-down to a dead stop, where breakaway friction holds the wheel', () => {
    // From fraction 0.0038, turning at 0.4 rev/s, the wheel is just above
    // where it stalls (0.00374, D5). It stops about 330 s in, so the stopping
    // step is inside the balance. Starting closer keeps the run short enough
    // for a CI runner (400 s is 1.6 million steps).
    const { inJ, outJ, final } = balance(0.0038, true, 400, [], 2.5);
    expect(final.rotorOmegaRadS).toBe(0);
    // PHYSICS.md, D5: the wheel stalls at fraction 0.00374. 0.5%: that is a
    // quasi-steady figure, and the wheel coasts a little way past it as it stops.
    expect(Math.abs(windFraction(final.barrelAngleRad, P) / 0.00374 - 1)).toBeLessThan(0.005);
    expect(Math.abs(inJ - outJ) / inJ).toBeLessThan(TOLERANCE);
  });

  it('books spring energy exactly: the ledger equals the drop in stored spring energy', () => {
    const { final, springDrop } = balance(1, true, 20);
    // Both are sums of the same exact trapezoids, so only float rounding separates them.
    expect(final.energy.springJ).toBeCloseTo(springDrop, 15);
  });

  it('loses the train its 40% share of whatever the spring releases', () => {
    const { final } = balance(0.5, true, 20);
    expect(final.energy.trainLossJ / final.energy.springJ).toBeCloseTo(1 - P.trainEfficiency, 12);
  });
});
