import { describe, expect, it } from 'vitest';
import { LOCK_PHASE_TOLERANCE_RAD, MECHANICAL_BEAT_HZ } from '../../src/sim/params.ts';
import { TAU } from '../../src/sim/units.ts';
import { handAngles } from '../../src/widgets/shared/dial.ts';
import {
  DIAL_START_S,
  SLOW_MOTION_RATE,
  advanceHero,
  beatStepRad,
  elapsedS,
  formatPlayback,
  heightForWidth,
  heroLayout,
  initialHeroState,
  loupeHalfWindowRad,
  loupeMarks,
  loupePoint,
  mechanicalShownS,
  playbackRate,
  readouts,
  setSlowMotion,
  springDriveShownS,
  type HeroState,
} from '../../src/widgets/hero-glide/logic.ts';
import { P } from '../sim/helpers.ts';

const FRAME_S = 1 / 60;

/** Advance frame by frame, as the scheduler would. */
function frames(state: HeroState, count: number, dtS = FRAME_S): HeroState {
  let s = state;
  for (let i = 0; i < count; i++) s = advanceHero(s, dtS, P);
  return s;
}

describe('hero-glide: the Spring Drive', () => {
  it('opens already regulated at 8 rev/s, with no lock transient to watch', () => {
    const s = initialHeroState(P);
    expect(s.sim.rotorOmegaRadS).toBe(P.rotorTargetOmegaRadS);
    expect(s.sim.regulator.icOn).toBe(true);
    expect(springDriveShownS(s, P)).toBe(DIAL_START_S);
    expect(elapsedS(s)).toBe(0);
  });

  it('keeps its seconds hand on true time within the lock tolerance over a minute, frame by frame', () => {
    let s = initialHeroState(P);
    let worstRad = 0;
    for (let i = 0; i < 3600; i++) {
      s = advanceHero(s, FRAME_S, P);
      const handErrorS = springDriveShownS(s, P) - (DIAL_START_S + elapsedS(s));
      worstRad = Math.max(worstRad, Math.abs(handErrorS) * P.rotorTargetOmegaRadS);
    }
    // Hand error in seconds, times the wheel's speed, is the wheel's phase
    // error: it must stay inside the lock tolerance (a hundredth of a turn,
    // PHYSICS.md) the whole minute, which on the hand is 1/480 of a second
    // hand's step, invisible.
    expect(worstRad).toBeLessThan(LOCK_PHASE_TOLERANCE_RAD);
    // One minute of frames is one minute of sim time, less what is carried
    // to the next frame: under a step, and exactly one when 3,600 sums of a
    // float 1/60 land a hair short of 60.
    expect(Math.abs(elapsedS(s) - 60)).toBeLessThanOrEqual(P.stepS);
  });

  it('glides: the hand moves every frame, by the frame’s share of 6° a second', () => {
    let s = frames(initialHeroState(P), 60);
    for (let i = 0; i < 30; i++) {
      const before = handAngles(springDriveShownS(s, P)).secondRad;
      s = advanceHero(s, FRAME_S, P);
      const moved = handAngles(springDriveShownS(s, P)).secondRad - before;
      // 6°/s over a frame is 0.1°; a frame's sim time is a whole number of
      // detailed steps, so it varies by up to one step (0.24 ms) either way.
      expect(moved).toBeGreaterThan(0);
      expect(Math.abs(moved - (TAU / 60) * FRAME_S)).toBeLessThan((TAU / 60) * 2 * P.stepS + 1e-9);
    }
  });

  it('runs its sim at an eighth of the page’s clock in slow motion, still at 8 rev/s', () => {
    const slow = setSlowMotion(initialHeroState(P), true);
    expect(playbackRate(slow)).toBe(SLOW_MOTION_RATE);
    const after = frames(slow, 480);
    // As above: 480 frames of an eighth of 1/60 is 1 s, less the carry.
    expect(Math.abs(elapsedS(after) - 1)).toBeLessThanOrEqual(P.stepS);
    expect(Math.abs(after.sim.rotorOmegaRadS / P.rotorTargetOmegaRadS - 1)).toBeLessThan(1e-3);
  });

  it('never steps more than the frame it was given, even for a huge gap (the scheduler clamps it to 0.1 s)', () => {
    const s = advanceHero(initialHeroState(P), 0.1, P);
    expect(elapsedS(s)).toBeLessThanOrEqual(0.1);
    expect(elapsedS(s)).toBeGreaterThan(0.1 - P.stepS);
  });

  it('stands still for a zero-length frame, the first after the loop restarts', () => {
    const s = initialHeroState(P);
    expect(advanceHero(s, 0, P).sim).toEqual(s.sim);
  });

  it('carries sub-step time between frames, so many short frames add up to the same time as one long one', () => {
    const short = frames(initialHeroState(P), 1000, 1 / 10_000);
    expect(short.sim.step).toBe(Math.floor(0.1 / P.stepS));
  });
});

describe('hero-glide: the mechanical watch', () => {
  it('steps 8 times a second, 0.75° each, from the published-rate assumption in PHYSICS.md', () => {
    expect(MECHANICAL_BEAT_HZ).toBe(8);
    expect((beatStepRad() * 360) / TAU).toBeCloseTo(0.75, 12);
  });

  it('shows true time floored to its last beat', () => {
    expect(mechanicalShownS(0)).toBe(DIAL_START_S);
    expect(mechanicalShownS(0.124)).toBe(DIAL_START_S);
    expect(mechanicalShownS(0.125)).toBe(DIAL_START_S + 0.125);
    expect(mechanicalShownS(1.3)).toBe(DIAL_START_S + 1.25);
  });

  it('holds its hand still between beats and jumps a whole step at each', () => {
    const angles = [0.05, 0.1, 0.124, 0.125, 0.2].map((t) => handAngles(mechanicalShownS(t)).secondRad);
    expect(angles[0]).toBe(angles[1]);
    expect(angles[1]).toBe(angles[2]);
    expect(angles[3]! - angles[2]!).toBeCloseTo(beatStepRad(), 12);
    expect(angles[4]).toBe(angles[3]);
  });

  it('agrees with the Spring Drive to within one beat, since neither has a rate error', () => {
    const s = frames(initialHeroState(P), 600);
    const gap = springDriveShownS(s, P) - mechanicalShownS(elapsedS(s));
    expect(gap).toBeGreaterThanOrEqual(-LOCK_PHASE_TOLERANCE_RAD / P.rotorTargetOmegaRadS);
    expect(gap).toBeLessThan(1 / MECHANICAL_BEAT_HZ);
  });
});

describe('hero-glide: readouts', () => {
  it('put a unit on every value', () => {
    const values = readouts(initialHeroState(P)).map((r) => r.value);
    expect(values).toEqual(['8.000\u202frev/s', '8\u202fbeats/s', '0.75° a beat', '1× real time']);
  });

  it('say when slow motion is on', () => {
    const slow = readouts(setSlowMotion(initialHeroState(P), true));
    expect(slow.find((r) => r.label === 'Playback')?.value).toBe('1/8× real time');
    expect(formatPlayback(1)).toBe('1×');
    expect(formatPlayback(0.25)).toBe('1/4×');
  });
});

describe('hero-glide: layout', () => {
  it('fits two dials and their loupes side by side in a 380 px phone’s 356 px column', () => {
    const l = heroLayout(356);
    expect(l.springDrive.radius).toBe(77);
    expect(l.springDrive.cx + l.springDrive.radius).toBeLessThanOrEqual(l.mechanical.cx - l.mechanical.radius);
    expect(l.mechanical.cx + l.mechanical.radius).toBeLessThanOrEqual(356);
    expect(l.springDrive.loupe.cy - l.springDrive.loupe.radius).toBeGreaterThan(l.springDrive.labelY);
    expect(heightForWidth(356)).toBe(l.height);
    expect(l.height).toBeGreaterThanOrEqual(l.springDrive.loupe.cy + l.springDrive.loupe.radius);
  });

  it('caps the dials on a wide desktop column rather than growing without end', () => {
    expect(heroLayout(2000).springDrive.radius).toBe(110);
    expect(heroLayout(2000).springDrive.loupe.radius).toBe(56);
  });

  it('never produces a negative size for a column narrower than its margins', () => {
    const l = heroLayout(0);
    expect(l.springDrive.radius).toBe(0);
    expect(l.height).toBeGreaterThan(0);
  });
});

describe('hero-glide: the loupe', () => {
  const centre = { x: 100, y: 50 };

  it('puts the dial point it follows at its own centre', () => {
    const p = loupePoint(70, 1.2, 1.2, 70, 12, centre);
    expect(p.x).toBeCloseTo(100, 12);
    expect(p.y).toBeCloseTo(50, 12);
  });

  it('magnifies a step along the dial k times, later seconds to the right', () => {
    const step = beatStepRad();
    const p = loupePoint(70, 1.2 + step, 1.2, 70, 12, centre);
    // Arc length of one beat at 70 px, magnified 12×: 70 × 0.0131 × 12 = 11 px.
    expect(p.x - 100).toBeCloseTo(12 * 70 * Math.sin(step), 12);
    expect(p.x - 100).toBeGreaterThan(10);
  });

  it('turns so the direction it follows points up: further out on the dial is higher in the loupe', () => {
    expect(loupePoint(80, 2, 2, 70, 12, centre).y).toBeLessThan(50);
    expect(loupePoint(60, 2, 2, 70, 12, centre).y).toBeGreaterThan(50);
  });

  it('shows the scale of seconds and beats around its centre, with every whole second marked', () => {
    const marks = loupeMarks(0, 3 * beatStepRad());
    expect(marks.map((m) => m.angleRad / beatStepRad())).toEqual(
      [-3, -2, -1, 0, 1, 2, 3].map((i) => expect.closeTo(i, 9)),
    );
    expect(marks.filter((m) => m.second).map((m) => Math.round(m.angleRad / beatStepRad()))).toEqual([0]);
  });

  it('marks whole seconds correctly on either side of 12, where the index goes negative', () => {
    const marks = loupeMarks(-TAU / 60, 1.5 * beatStepRad());
    const seconds = marks.filter((m) => m.second);
    expect(seconds).toHaveLength(1);
    expect(seconds[0]!.angleRad).toBeCloseTo(-TAU / 60, 12);
  });

  it('spans just over its own radius, so marks slide in from beyond the edge', () => {
    const half = loupeHalfWindowRad(42, 72, 12);
    expect(half * 72 * 12).toBeCloseTo(1.2 * 42, 9);
    expect(loupeHalfWindowRad(42, 0, 12)).toBe(0);
  });
});
