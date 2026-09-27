import { describe, expect, it } from 'vitest';
import { coastBrakeTorqueNm, coastFrictionTorqueNm, spinDown, spinDownTimeS } from '../../src/sim/spindown.ts';
import { TAU } from '../../src/sim/units.ts';
import {
  HISTORY_RUNS,
  INITIAL_DUTY,
  SAMPLE_EVERY_STEPS,
  SLOW_MOTION_RATE,
  TORQUE_ARC_MAX_RAD,
  WIDE_MIN_PX,
  advanceLenz,
  currentRun,
  dutyValueText,
  gridTicks,
  heightForWidth,
  initialLenzState,
  isStopped,
  lenzLayout,
  letGo,
  openCoilRun,
  plotPoint,
  plotSpeedMaxRevS,
  plotWindowS,
  readouts,
  rotorAngleRad,
  rotorOmegaRadS,
  runLabel,
  setDuty,
  setSlowMotion,
  sinceReleaseS,
  placeLabels,
  openCoilLabelTimeS,
  torqueArcRad,
  type LenzState,
} from '../../src/widgets/lenz-brake/logic.ts';
import { P } from '../sim/helpers.ts';

const W0 = P.rotorTargetOmegaRadS;
const FRAME_S = 1 / 60;
const SAMPLE_S = SAMPLE_EVERY_STEPS * P.stepS;

function run(state: LenzState, frames: number, dtS = FRAME_S): LenzState {
  let s = state;
  for (let i = 0; i < frames; i++) s = advanceLenz(s, dtS, P);
  return s;
}

const values = (s: LenzState) => readouts(s, P).map((r) => r.value);

describe('lenz-brake: held, before letting go', () => {
  it('opens with the wheel turned at 8 rev/s by hand and the coil shorted a quarter of the time', () => {
    const s = initialLenzState();
    expect(s.phase.kind).toBe('held');
    expect(rotorOmegaRadS(s, P)).toBe(W0);
    expect(s.duty).toBe(INITIAL_DUTY);
    expect(currentRun(s)).toBeNull();
  });

  it('turns at 8 rev/s: a second is 8 turns, 48° a frame at 60 frames a second', () => {
    const s = run(initialLenzState(), 60);
    expect(rotorAngleRad(s) / TAU).toBeCloseTo(8, 9);
    expect((s.sweepRad * 360) / TAU).toBeCloseTo(48, 9);
  });

  it('shows the torque the hand holding it would feel, which the slider changes at once', () => {
    const s = initialLenzState();
    // A quarter of D4's 198.9 nN·m, and a quarter of D10's 8.106 µA.
    expect(values(s).slice(0, 6)).toEqual(['8.00 rev/s', '25 %', '49.7 nN·m', '9.5 nN·m', '2.03 µA', '0.000 s']);
    expect(values(setDuty(s, 1))[2]).toBe('198.9 nN·m');
    expect(values(setDuty(s, 0))[2]).toBe('0.0 nN·m');
    expect(values(setDuty(s, 0))[4]).toBe('0.00 µA');
  });
});

describe('lenz-brake: letting go', () => {
  it('coasts from 8 rev/s, keeping the magnet where it was, and slows', () => {
    const held = run(initialLenzState(), 7);
    const s = letGo(held, true, P);
    expect(rotorAngleRad(s)).toBe(rotorAngleRad(held));
    expect(rotorOmegaRadS(s, P)).toBe(W0);
    const later = run(s, 6);
    expect(rotorOmegaRadS(later, P)).toBeLessThan(W0);
    expect(sinceReleaseS(later)).toBeCloseTo(0.1, 3);
  });

  it('stops when the sim says it stops, and the clock readout holds there', () => {
    const s = run(letGo(initialLenzState(), true, P), 60);
    expect(isStopped(s)).toBe(true);
    const stopS = spinDownTimeS(W0, INITIAL_DUTY, P)!;
    expect(sinceReleaseS(s)).toBe(stopS);
    expect(values(s)[0]).toBe('0.00 rev/s');
    expect(values(s)[5]).toBe('0.299 s');
    // At rest nothing turns, so nothing brakes and nothing rubs.
    expect(values(s)[2]).toBe('0.0 nN·m');
    expect(values(s)[3]).toBe('0.0 nN·m');
    const after = run(s, 60);
    expect(sinceReleaseS(after)).toBe(stopS);
    expect(after.sweepRad).toBe(0);
  });

  it('traces the same curve frame by frame as the sim gives in one go', () => {
    const s = run(letGo(initialLenzState(), true, P), 60);
    expect(currentRun(s)!.points).toEqual(spinDown(W0, INITIAL_DUTY, P, SAMPLE_S).points);
  });

  it('while still, computes the whole run at once, so the still frame shows where it ends', () => {
    const s = letGo(initialLenzState(), false, P);
    expect(isStopped(s)).toBe(true);
    expect(currentRun(s)!.points).toEqual(spinDown(W0, INITIAL_DUTY, P, SAMPLE_S).points);
    expect(currentRun(s)!.stopS).toBe(spinDownTimeS(W0, INITIAL_DUTY, P));
  });

  it('stops sooner, with a steeper curve, the more of the time the coil is shorted', () => {
    const at = (d: number) => letGo(setDuty(initialLenzState(), d), false, P);
    const times = [0, 0.25, 0.5, 1].map((d) => currentRun(at(d))!.stopS!);
    // PHYSICS.md, D10: 1.118, 0.299, 0.185, and 0.110 s.
    expect(times.map((t) => Number(t.toFixed(3)))).toEqual([1.118, 0.299, 0.185, 0.11]);
  });

  it('keeps earlier runs to compare, the newest three, finished or cut short', () => {
    let s = initialLenzState();
    for (const d of [0.1, 0.2, 0.3, 0.4]) s = letGo(setDuty(s, d), false, P);
    s = run(letGo(setDuty(s, 0.5), true, P), 3);
    // Cut short by a fresh let-go while still turning.
    s = letGo(s, true, P);
    expect(s.history).toHaveLength(HISTORY_RUNS);
    expect(s.history.map((r) => r.duty)).toEqual([0.3, 0.4, 0.5]);
    expect(s.history.at(-1)!.stopS).toBeNull();
  });

  it('marks a run as varied if the slider moves while the wheel still turns, but not before or after', () => {
    const held = setDuty(initialLenzState(), 0.5);
    expect(currentRun(held)).toBeNull();
    const coasting = setDuty(run(letGo(held, true, P), 3), 0.9);
    expect(currentRun(coasting)!.varied).toBe(true);
    expect(runLabel(currentRun(coasting)!)).toBe('varied');
    const stopped = setDuty(letGo(setDuty(initialLenzState(), 0.5), false, P), 0.9);
    expect(currentRun(stopped)!.varied).toBe(false);
  });

  it('a mid-run change bends the curve: the rest of the run brakes at the new duty', () => {
    const slow = run(setDuty(run(letGo(setDuty(initialLenzState(), 0), true, P), 3), 1), 60);
    const openStop = spinDownTimeS(W0, 0, P)!;
    const shortStop = spinDownTimeS(W0, 1, P)!;
    expect(sinceReleaseS(slow)).toBeGreaterThan(shortStop);
    expect(sinceReleaseS(slow)).toBeLessThan(openStop);
  });
});

describe('lenz-brake: the clock', () => {
  it('runs at an eighth of real time in slow motion', () => {
    const s = run(letGo(setSlowMotion(initialLenzState(), true), true, P), 60);
    // One second of page time is an eighth of a second of sim time.
    expect(sinceReleaseS(s)).toBeCloseTo(SLOW_MOTION_RATE, 3);
    expect(values(s)[6]).toBe('1/8× real time');
  });

  it('treats a zero, a negative, or a non-number frame gap as no time', () => {
    const s = letGo(initialLenzState(), true, P);
    for (const dt of [0, -1, Number.NaN]) expect(sinceReleaseS(advanceLenz(s, dt, P))).toBe(0);
  });

  it('takes a clamped 0.1 s step from a tab back from the background like any other', () => {
    const s = advanceLenz(letGo(initialLenzState(), true, P), 0.1, P);
    expect(sinceReleaseS(s)).toBeCloseTo(0.1, 3);
    expect(isStopped(s)).toBe(false);
  });

  it('clamps the duty to [0, 1], and ignores a non-number', () => {
    const s = initialLenzState();
    expect(setDuty(s, 2).duty).toBe(1);
    expect(setDuty(s, -1).duty).toBe(0);
    expect(setDuty(s, Number.NaN).duty).toBe(INITIAL_DUTY);
  });
});

describe('lenz-brake: the plot', () => {
  it('always shows the open coil’s run, stopping at 1.118 s, and scales time to 1.25 s to fit it', () => {
    const open = openCoilRun(P);
    expect(open.stopS!).toBeCloseTo(1.118, 3);
    expect(runLabel(open)).toBe('open coil');
    expect(plotWindowS(open)).toBe(1.25);
    expect(plotSpeedMaxRevS(P)).toBeCloseTo(8, 12);
  });

  it('names runs by the share of the time the coil was shorted', () => {
    const s = letGo(setDuty(initialLenzState(), 0.4), false, P);
    expect(runLabel(currentRun(s)!)).toBe('40 % shorted');
  });

  it('puts grid lines every 2 rev/s and every quarter second, without float drift', () => {
    expect(gridTicks(8, 2)).toEqual([0, 2, 4, 6, 8]);
    expect(gridTicks(1.25, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25]);
    expect(gridTicks(1, 0.1)).toHaveLength(11);
  });

  it('maps the plot’s corners, and clamps off-scale points to its edges', () => {
    const box = { x: 10, y: 20, width: 100, height: 50 };
    expect(plotPoint(box, 0, W0, 1.25, 8)).toEqual({ x: 10, y: 20 });
    expect(plotPoint(box, 1.25, 0, 1.25, 8)).toEqual({ x: 110, y: 70 });
    expect(plotPoint(box, 5, 2 * W0, 1.25, 8)).toEqual({ x: 110, y: 20 });
  });

  it('writes each run’s name beside its stop, to the right if it fits, else to the left, and never over another', () => {
    const placed = placeLabels(
      [
        { x: 100, width: 40 }, // right of its stop
        { x: 290, width: 40 }, // no room right: left
        { x: 95, width: 40 }, // right overlaps the first: left
        { x: 100, width: 40 }, // both sides taken: left off
      ],
      0,
      300,
    );
    expect(placed).toEqual([{ from: 104, to: 144 }, { from: 246, to: 286 }, { from: 51, to: 91 }, null]);
  });

  it('writes the open coil’s name half way across, above the slowest curve', () => {
    expect(openCoilLabelTimeS(1.25)).toBe(0.625);
  });
});

describe('lenz-brake: torque arcs', () => {
  it('draw the full brake at 8 rev/s as 120°, and friction 21 times shorter', () => {
    expect(torqueArcRad(coastBrakeTorqueNm(W0, 1, P), P)).toBeCloseTo(TORQUE_ARC_MAX_RAD, 12);
    const friction = torqueArcRad(coastFrictionTorqueNm(W0, P), P);
    expect(TORQUE_ARC_MAX_RAD / friction).toBeCloseTo(20.85, 2);
  });

  it('draw nothing for no torque, and never more than 120°', () => {
    expect(torqueArcRad(0, P)).toBe(0);
    expect(torqueArcRad(Number.NaN, P)).toBe(0);
    expect(torqueArcRad(1, P)).toBe(TORQUE_ARC_MAX_RAD);
  });
});

describe('lenz-brake: readouts', () => {
  it('announce the slider’s value as a share of the time', () => {
    expect(dutyValueText(0.25)).toBe('25 % of the time');
  });
});

describe('lenz-brake: layout', () => {
  it('stacks the plot under the wheel in a 380 px phone’s 356 px column, inside the column', () => {
    const l = lenzLayout(356);
    expect(l.wide).toBe(false);
    expect(l.wheel.cx - l.frictionArcRadius).toBeGreaterThanOrEqual(0);
    expect(l.wheel.cx + l.frictionArcRadius).toBeLessThanOrEqual(356);
    expect(l.coil.y + l.coil.height).toBeLessThan(l.wheel.cy - l.frictionArcRadius);
    expect(l.plot.y).toBeGreaterThan(l.legendY);
    expect(l.plot.x + l.plot.width).toBeLessThanOrEqual(356);
    expect(l.plot.y + l.plot.height).toBeLessThanOrEqual(l.height);
  });

  it('sets the plot beside the wheel on a desktop column, without overlapping it', () => {
    const l = lenzLayout(700);
    expect(l.wide).toBe(true);
    expect(l.plot.x).toBeGreaterThan(l.wheel.cx + l.frictionArcRadius);
    expect(l.plot.x + l.plot.width).toBeLessThanOrEqual(700);
    expect(l.legendY).toBeLessThan(l.height);
    expect(l.plot.y + l.plot.height).toBeLessThanOrEqual(l.height);
  });

  it('switches layout at its breakpoint, and reports the height it needs', () => {
    expect(lenzLayout(WIDE_MIN_PX - 1).wide).toBe(false);
    expect(lenzLayout(WIDE_MIN_PX).wide).toBe(true);
    expect(heightForWidth(356)).toBe(lenzLayout(356).height);
  });

  it('draws nothing rather than negative sizes in a zero-width slot', () => {
    const l = lenzLayout(0);
    expect(l.wheel.radius).toBe(0);
    expect(l.plot.width).toBe(0);
  });
});
