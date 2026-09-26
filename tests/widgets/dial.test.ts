import { describe, expect, it } from 'vitest';
import { TAU } from '../../src/sim/units.ts';
import { DIAL_MARKS, handAngles, polar } from '../../src/widgets/shared/dial.ts';

describe('handAngles', () => {
  it('points every hand at 12 at 12:00:00', () => {
    expect(handAngles(0)).toEqual({ hourRad: 0, minuteRad: 0, secondRad: 0 });
  });

  it('turns the seconds hand once a minute, the minute hand once an hour, and the hour hand once in 12 hours', () => {
    const quarter = TAU / 4;
    expect(handAngles(15).secondRad).toBeCloseTo(quarter, 12);
    expect(handAngles(15 * 60).minuteRad).toBeCloseTo(quarter, 12);
    expect(handAngles(3 * 3600).hourRad).toBeCloseTo(quarter, 12);
  });

  it('moves every hand continuously, with no rounding to whole seconds', () => {
    expect(handAngles(0.125).secondRad).toBeCloseTo((TAU * 0.125) / 60, 15);
  });

  it('keeps every angle in one turn after days of shown time', () => {
    const a = handAngles(3 * 86_400 + 12.5);
    for (const angle of Object.values(a)) {
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(TAU);
    }
    expect(a.secondRad).toBeCloseTo((TAU * 12.5) / 60, 9);
  });
});

describe('polar', () => {
  it('puts angle zero straight up and turns clockwise, like a hand', () => {
    const up = polar(100, 100, 50, 0);
    expect(up.x).toBeCloseTo(100, 12);
    expect(up.y).toBeCloseTo(50, 12);
    const right = polar(100, 100, 50, TAU / 4);
    expect(right.x).toBeCloseTo(150, 12);
    expect(right.y).toBeCloseTo(100, 12);
  });
});

describe('DIAL_MARKS', () => {
  it('has 60 marks, every fifth one an hour mark, starting at 12', () => {
    expect(DIAL_MARKS).toHaveLength(60);
    expect(DIAL_MARKS.filter((m) => m.major)).toHaveLength(12);
    expect(DIAL_MARKS[0]).toEqual({ angleRad: 0, major: true });
    expect(DIAL_MARKS[1]!.major).toBe(false);
  });
});
