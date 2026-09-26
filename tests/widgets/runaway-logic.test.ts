import { describe, expect, it } from 'vitest';
import { TAU } from '../../src/sim/units.ts';
import {
  FAST_FORWARD_RATE,
  SPOKE_COUNT,
  advanceRunaway,
  barFraction,
  blur,
  heightForWidth,
  initialRunawayState,
  isFastForward,
  readouts,
  rotorAngleRad,
  rotorOmegaRadS,
  runawayLayout,
  setFastForward,
  shownS,
  speedRatio,
  speedScaleMaxRevS,
  trueS,
  wind,
  woundFraction,
  type RunawayState,
} from '../../src/widgets/runaway/logic.ts';
import { P, revS } from '../sim/helpers.ts';

const FRAME_S = 1 / 60;

function frames(state: RunawayState, count: number, dtS = FRAME_S): RunawayState {
  let s = state;
  for (let i = 0; i < count; i++) s = advanceRunaway(s, dtS, P);
  return s;
}

/** PHYSICS.md, Model predictions: the unbraked wheel at full wind. */
const RUNAWAY_REV_S = 30.61;

describe('runaway: before winding', () => {
  it('starts let down and at rest, and stays that way: a run-down spring cannot turn the wheel', () => {
    const s = frames(initialRunawayState(P), 120);
    expect(woundFraction(s, P)).toBe(0);
    expect(rotorOmegaRadS(s)).toBe(0);
    expect(rotorAngleRad(s)).toBe(0);
    expect(s.sweepRad).toBe(0);
    // True time still passes; the hands do not.
    expect(trueS(s)).toBeCloseTo(2, 2);
    expect(shownS(s, P)).toBe(0);
  });
});

describe('runaway: winding, in real time', () => {
  it('winds the spring fully and sets both sets of hands to 12:00', () => {
    const s = wind(frames(initialRunawayState(P), 30), P);
    expect(woundFraction(s, P)).toBe(1);
    expect(shownS(s, P)).toBe(0);
    expect(trueS(s)).toBe(0);
  });

  it('spins the wheel up to the 30.61 rev/s PHYSICS.md predicts, 3.8× the speed that keeps time', () => {
    const s = frames(wind(initialRunawayState(P), P), 10 * 60);
    // Test 1's run, frame by frame, with test 1's tolerance and reasons:
    // 0.1%, for the 1.4 × 10⁻⁴ of full wind unwound in 10 s. The spin-up
    // itself is long gone: while the capacitor charges it adds C·k_e² to the
    // inertia (D5), making the time constant 0.87 s rather than J/b's
    // 0.625 s, so 10 s is over eleven of them.
    expect(Math.abs(revS(rotorOmegaRadS(s)) / RUNAWAY_REV_S - 1)).toBeLessThan(0.001);
    expect(speedRatio(s, P)).toBeGreaterThan(3.8);
    expect(speedRatio(s, P)).toBeLessThan(3.84);
  });

  it('makes the hands gain on true time from the first turn', () => {
    const s = frames(wind(initialRunawayState(P), P), 10 * 60);
    // Over 10 s the wheel averages less than its settled speed, because it
    // spent the first two seconds spinning up; still well over three times.
    expect(shownS(s, P) / trueS(s)).toBeGreaterThan(3);
    expect(shownS(s, P) / trueS(s)).toBeLessThan(RUNAWAY_REV_S / 8);
  });

  it('keeps the wheel turning through a rewind, which only tops the spring up', () => {
    const running = frames(wind(initialRunawayState(P), P), 3 * 60);
    const rewound = wind(running, P);
    expect(rotorOmegaRadS(rewound)).toBe(rotorOmegaRadS(running));
    expect(woundFraction(rewound, P)).toBe(1);
    expect(shownS(rewound, P)).toBe(0);
  });

  it('records each frame’s sweep for the motion blur: about half a turn at 30.6 rev/s and 60 frames a second', () => {
    const s = frames(wind(initialRunawayState(P), P), 5 * 60);
    // A frame is a whole number of detailed steps, so it varies by one step.
    expect(Math.abs(s.sweepRad - rotorOmegaRadS(s) * FRAME_S)).toBeLessThan(rotorOmegaRadS(s) * P.stepS * 1.01);
    expect(s.sweepRad / TAU).toBeCloseTo(0.51, 2);
  });

  it('stands still for a zero-length frame, and steps no more than a clamped 0.1 s frame, plus what earlier frames carried', () => {
    const s = frames(wind(initialRunawayState(P), P), 60);
    const still = advanceRunaway(s, 0, P);
    expect(rotorAngleRad(still)).toBe(rotorAngleRad(s));
    expect(still.sweepRad).toBe(0);
    // The scheduler never hands over more than 0.1 s. The frame also spends
    // the part of a step earlier frames left over, which is under one step.
    const gap = advanceRunaway(s, 0.1, P);
    expect(trueS(gap) - trueS(s)).toBeLessThan(0.1 + P.stepS);
  });
});

describe('runaway: fast-forward', () => {
  it('runs an hour of sim time for each second of page time', () => {
    const on = setFastForward(wind(initialRunawayState(P), P), true, P);
    expect(isFastForward(on)).toBe(true);
    const s = frames(on, 60);
    expect(FAST_FORWARD_RATE).toBe(3600);
    // 60 frames of a float 1/60 s, times 3,600: 3,600 s to float rounding.
    expect(trueS(s)).toBeCloseTo(3600, 6);
  });

  it('runs the spring down and stops the wheel at 28.94 h, as the unbraked run-down in PHYSICS.md does', () => {
    let s = setFastForward(wind(initialRunawayState(P), P), true, P);
    let stoppedAtS: number | null = null;
    for (let i = 0; i < 31 * 60 && stoppedAtS === null; i++) {
      s = advanceRunaway(s, FRAME_S, P);
      if (rotorOmegaRadS(s) === 0) stoppedAtS = trueS(s);
    }
    // The wheel stops at 104,186 s (tests/sim/runaway.test.ts). The widget
    // advances a frame, 60 s of sim time, at a time, so it sees the stop at
    // the end of the frame it falls in: up to 60 s late.
    expect(stoppedAtS).not.toBeNull();
    expect(stoppedAtS!).toBeGreaterThanOrEqual(104_186 - 1);
    expect(stoppedAtS!).toBeLessThan(104_186 + 60);
    // The hands show 71.73 h (D8), and stop there.
    expect(shownS(s, P) / 3600).toBeCloseTo(71.73, 2);
    const later = frames(s, 60);
    expect(shownS(later, P)).toBe(shownS(s, P));
    expect(trueS(later)).toBeGreaterThan(trueS(s));
    expect(readouts(later, P).find((r) => r.label === 'Glide wheel speed')?.value).toBe('0.0\u202frev/s');
  });

  it('comes back to real time where it left off, and carries on from there', () => {
    const ff = frames(setFastForward(wind(initialRunawayState(P), P), true, P), 120);
    const back = setFastForward(ff, false, P);
    expect(isFastForward(back)).toBe(false);
    expect(rotorAngleRad(back)).toBe(rotorAngleRad(ff));
    expect(rotorOmegaRadS(back)).toBe(rotorOmegaRadS(ff));
    expect(woundFraction(back, P)).toBe(woundFraction(ff, P));
    // Time is rounded to a detailed step (detailedFromAveraged).
    expect(Math.abs(trueS(back) - trueS(ff))).toBeLessThanOrEqual(P.stepS / 2);
    // One more second of real time: within the modes' unregulated agreement
    // of 2 × 10⁻⁴ (test 7), since nothing but the mode changed.
    const next = frames(back, 60);
    expect(Math.abs(rotorOmegaRadS(next) / rotorOmegaRadS(ff) - 1)).toBeLessThan(2e-4 + 1e-4);
  });

  it('restarts a stopped wheel when wound while fast-forwarding', () => {
    let s = setFastForward(wind(initialRunawayState(P), P), true, P);
    s = frames(s, 30 * 60);
    expect(rotorOmegaRadS(s)).toBe(0);
    s = wind(s, P);
    expect(woundFraction(s, P)).toBe(1);
    expect(revS(rotorOmegaRadS(s))).toBeCloseTo(RUNAWAY_REV_S, 1);
    expect(shownS(s, P)).toBe(0);
  });

  it('ignores a switch to the mode it is already in', () => {
    const s = initialRunawayState(P);
    expect(setFastForward(s, false, P)).toBe(s);
  });
});

describe('runaway: readouts', () => {
  it('put a unit on every value', () => {
    const values = readouts(frames(wind(initialRunawayState(P), P), 5 * 60), P).map((r) => r.value);
    // Five seconds after winding: still settling, hands well ahead.
    expect(values[0]).toMatch(/^30\.\d\u202frev\/s$/);
    expect(values[1]).toMatch(/^3\.8\d× real time$/);
    expect(values[2]).toMatch(/^\d+\.\d\u202fs$/);
    expect(values[3]).toMatch(/^[45]\.\d\u202fs$/);
    expect(values[4]).toBe('100.0\u202f%');
  });
});

describe('runaway: drawing geometry', () => {
  it('scales the speed bar to 35 rev/s, the unbraked full-wind speed rounded up', () => {
    expect(speedScaleMaxRevS(P)).toBe(35);
  });

  it('clamps a bar between empty and full', () => {
    expect(barFraction(8, 35)).toBeCloseTo(8 / 35, 12);
    expect(barFraction(-1, 35)).toBe(0);
    expect(barFraction(40, 35)).toBe(1);
    expect(barFraction(1, 0)).toBe(0);
  });

  it('draws a still or slow wheel sharp', () => {
    expect(blur(0)).toEqual({ copies: 1, stepRad: 0, alpha: 1 });
    expect(blur(0.01)).toEqual({ copies: 1, stepRad: 0, alpha: 1 });
    expect(blur(Number.NaN)).toEqual({ copies: 1, stepRad: 0, alpha: 1 });
  });

  it('smears a fast wheel over at most one spoke spacing, where the pattern repeats', () => {
    const fast = blur(3.2);
    expect(fast.stepRad * (fast.copies - 1)).toBeCloseTo(TAU / SPOKE_COUNT, 12);
    expect(fast.copies).toBeLessThanOrEqual(12);
    expect(fast.alpha).toBeGreaterThanOrEqual(0.2);
    // An hour a frame in fast-forward is the same smear.
    expect(blur(1e6)).toEqual(fast);
  });

  it('smears a moderate sweep over exactly the angle swept', () => {
    const b = blur(0.3);
    expect(b.stepRad * (b.copies - 1)).toBeCloseTo(0.3, 12);
  });

  it('fits the wheel, the dial, and both bars in a 380 px phone’s 356 px column', () => {
    const l = runawayLayout(356);
    expect(l.rotor.cx + l.rotor.radius).toBeLessThanOrEqual(l.dial.cx - l.dial.radius);
    expect(l.dial.cx + l.dial.radius).toBeLessThanOrEqual(356);
    expect(l.speedBar.x + l.speedBar.width).toBeLessThanOrEqual(356);
    expect(l.springBar.y).toBeGreaterThan(l.speedBar.y + l.speedBar.height);
    expect(heightForWidth(356)).toBe(l.height);
    expect(l.height).toBeGreaterThan(l.springBar.y + l.springBar.height);
  });

  it('never produces a negative size for a column narrower than its margins', () => {
    const l = runawayLayout(0);
    expect(l.rotor.radius).toBe(0);
    expect(l.speedBar.width).toBe(0);
  });
});
