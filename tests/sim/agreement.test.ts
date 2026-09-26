import { describe, expect, it } from 'vitest';
import { averagedFromDetailed, runAveragedScenario, sampleOfAveraged, settle } from '../../src/sim/averaged.ts';
import { advanceDetailed, createState, phaseErrorRad, sampleOf } from '../../src/sim/detailed.ts';
import { rateErrorSPerDay } from '../../src/sim/metrics.ts';
import type { SimControls } from '../../src/sim/types.ts';
import { P } from './helpers.ts';

// Test 7 (PLAN.md): detailed and averaged modes agree on mean glide wheel
// speed and rate error over a shared window. Each window starts from one
// detailed state: detailed mode carries on from it, and averaged mode carries
// on from the same state converted with `averagedFromDetailed`. Both are then
// measured over the same span of sim time.

interface Window {
  windFraction: number;
  brakeEnabled: boolean;
  /** When the window opens, s: long enough after release for detailed mode to have settled. */
  startS: number;
  lengthS: number;
}

function compare(w: Window) {
  const controls: SimControls = { brakeEnabled: w.brakeEnabled };
  const d0 = advanceDetailed(createState(P, { windFraction: w.windFraction }), P, controls, w.startS).state;
  const d1 = advanceDetailed(d0, P, controls, w.lengthS).state;
  const a1 = runAveragedScenario({
    params: P,
    initial: averagedFromDetailed(d0, P),
    controls,
    durationS: w.lengthS,
    sampleIntervalS: w.lengthS,
  }).final;
  const meanD = (d1.rotorAngleRad - d0.rotorAngleRad) / w.lengthS;
  const meanA = (a1.rotorAngleRad - d0.rotorAngleRad) / w.lengthS;
  const from = sampleOf(d0, P);
  const rateD = rateErrorSPerDay(from, sampleOf(d1, P), P);
  const rateA = rateErrorSPerDay(from, sampleOfAveraged(a1), P);
  return { d0, d1, a1, meanD, meanA, rateD, rateA };
}

describe('test 7: mode agreement', () => {
  describe.each([
    ['full', 1],
    ['half', 0.5],
    ['low (0.03)', 0.03],
  ])('regulated, at %s wind, over the minute after 10 s', (_name, windFraction) => {
    const r = compare({ windFraction, brakeEnabled: true, startS: 10, lengthS: 60 });
    const residualRad = phaseErrorRad(r.d1, P);

    it('agrees on mean speed to 1 part in 10⁶', () => {
      // Both average 8 rev/s. They differ only by the phase error detailed
      // mode still carries at the end (below), which over a minute is under
      // 10⁻³ rad / (60 s × 50 rad/s) = 3 × 10⁻⁷.
      expect(Math.abs(r.meanA / r.meanD - 1)).toBeLessThan(1e-6);
    });

    it('agrees on rate error to 0.02 s/day, both far inside the rated ±0.5 s/day', () => {
      // Detailed mode 10 s after release has locked but is still settling:
      // its phase error is under 10⁻³ rad. Averaged mode ends exactly on the
      // reference. That residual, over a minute at 50 rad/s, is at most
      // 10⁻³ / 50.27 / 60 × 86,400 = 0.029 s/day; it measures 0.015 at worst.
      expect(Math.abs(residualRad)).toBeLessThan(1e-3);
      expect(Math.abs(r.rateA - r.rateD)).toBeLessThan(0.02);
      expect(Math.abs(r.rateD)).toBeLessThan(0.5);
      expect(Math.abs(r.rateA)).toBeLessThan(0.5);
    });

    it("differs in angle by exactly detailed mode's leftover phase error, since both follow the same crystal", () => {
      // Averaged mode ends regulated, at zero phase error, so its angle is the
      // reference's; detailed mode's is the reference's plus its residual.
      // 10⁻⁹ rad: float rounding in angles of about 3,500 rad.
      expect(r.a1.regime).toBe('regulated');
      expect(Math.abs(r.a1.rotorAngleRad - (r.d1.rotorAngleRad - residualRad))).toBeLessThan(1e-9);
    });

    it('agrees on brake duty and capacitor voltage', () => {
      // 2 × 10⁻⁵ duty: detailed mode's duty still carries the controller's
      // correction for its residual phase error, K_p × 10⁻³ rad = 2 × 10⁻⁵.
      expect(Math.abs(r.a1.duty - r.d1.regulator.duty)).toBeLessThan(2e-5);
      // 10 µV: the capacitor follows the duty; measured under 1 µV.
      expect(Math.abs(r.a1.capVoltageV - r.d1.capVoltageV)).toBeLessThan(1e-5);
    });
  });

  // Unregulated, the averaged speed is where the torques balance, and the
  // detailed speed trails that balance as the spring weakens. The lag is the
  // mechanical time constant times the deceleration, (J/b)·|dω/dt|, which on
  // the steep bottom of the torque curve reaches 1.6 × 10⁻⁴ of the speed. The
  // tolerance, 2 × 10⁻⁴, is that lag with a margin.
  const LAG_TOLERANCE = 2e-4;

  it('agrees on mean speed through a runaway: the brake disabled at full wind, over 30 s', () => {
    const r = compare({ windFraction: 1, brakeEnabled: false, startS: 10, lengthS: 30 });
    expect(Math.abs(r.meanA / r.meanD - 1)).toBeLessThan(LAG_TOLERANCE);
    expect(Math.abs(r.rateA / r.rateD - 1)).toBeLessThan(LAG_TOLERANCE * 2);
  });

  it('agrees on mean speed with a spring too weak to power the IC: 0.01 of full wind, over 100 s', () => {
    const r = compare({ windFraction: 0.01, brakeEnabled: true, startS: 20, lengthS: 100 });
    expect(r.d1.regulator.icOn).toBe(false);
    expect(r.a1.icOn).toBe(false);
    expect(Math.abs(r.meanA / r.meanD - 1)).toBeLessThan(LAG_TOLERANCE);
  });

  it('explains that gap: detailed mode trails the balance speed by (J/b)·|dω/dt|, to within 2%', () => {
    const controls = { brakeEnabled: true };
    const d0 = advanceDetailed(createState(P, { windFraction: 0.01 }), P, controls, 20).state;
    const d1 = advanceDetailed(d0, P, controls, 1).state;
    const decelRadS2 = d0.rotorOmegaRadS - d1.rotorOmegaRadS;
    const predictedLag = (P.rotorInertiaKgM2 / P.frictionViscousNmSRad) * decelRadS2;
    const balance = settle(averagedFromDetailed(d0, P), P, controls).rotorOmegaRadS;
    // 2%: the Stribeck term steepens friction slightly beyond b at this speed
    // (by e^(−24) of the breakaway excess, nothing), and the deceleration is
    // measured over a second in which it changes by under 1%.
    expect(Math.abs((d0.rotorOmegaRadS - balance) / predictedLag - 1)).toBeLessThan(0.02);
  });
});
