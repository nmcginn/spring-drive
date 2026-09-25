import { describe, expect, it } from 'vitest';
import { TAU } from '../../src/sim/units.ts';
import {
  PLACEHOLDER_SPIN_REV_S,
  advance,
  formatElapsed,
  formatSpinRate,
  heightForWidth,
  initialState,
  readouts,
  wheelGeometry,
} from '../../src/widgets/placeholder/logic.ts';

describe('placeholder state', () => {
  it('turns at the display rate', () => {
    const state = advance(initialState, 0.5);
    expect(state.angleRad).toBeCloseTo(PLACEHOLDER_SPIN_REV_S * TAU * 0.5, 12);
    expect(state.elapsedS).toBe(0.5);
    expect(state.ticks).toBe(1);
  });

  it('counts a zero-length frame as a tick without moving', () => {
    const state = advance(initialState, 0);
    expect(state).toEqual({ elapsedS: 0, angleRad: 0, ticks: 1 });
  });

  it('keeps the angle wrapped after a long run', () => {
    let state = initialState;
    for (let i = 0; i < 10_000; i++) state = advance(state, 0.1);
    expect(state.angleRad).toBeGreaterThanOrEqual(0);
    expect(state.angleRad).toBeLessThan(TAU);
  });
});

describe('placeholder readouts', () => {
  it('put a unit on every value, joined by a no-break space', () => {
    expect(formatElapsed(3.14159)).toBe('3.1\u202fs');
    expect(formatSpinRate(0.5)).toBe('0.50\u202frev/s');
    for (const { value } of readouts(initialState)) {
      expect(value).toMatch(/^[\d.]+\u202f\S+$/);
    }
  });

  it('keep a fixed number of decimals, so the text does not jitter as it changes', () => {
    expect(formatElapsed(0)).toBe('0.0\u202fs');
    expect(formatElapsed(12)).toBe('12.0\u202fs');
  });
});

describe('placeholder geometry', () => {
  it('stays between 160 and 240 px tall at any width', () => {
    expect(heightForWidth(0)).toBe(160);
    expect(heightForWidth(356)).toBe(178); // 380 px viewport less two 12 px paddings
    expect(heightForWidth(2000)).toBe(240);
  });

  it('points the marker up at zero and clockwise from there, like a watch hand', () => {
    const up = wheelGeometry(200, 200, 0);
    expect(up.markerX).toBeCloseTo(up.cx, 9);
    expect(up.markerY).toBeLessThan(up.cy);
    const right = wheelGeometry(200, 200, TAU / 4);
    expect(right.markerX).toBeGreaterThan(right.cx);
    expect(right.markerY).toBeCloseTo(right.cy, 9);
  });

  it('never produces a negative radius for a canvas smaller than its margins', () => {
    expect(wheelGeometry(10, 10, 0).radius).toBe(0);
  });
});
