import { describe, expect, it } from 'vitest';
import { SECONDS_PER_HOUR } from '../../src/sim/units.ts';
import {
  CHART_SPAN_S,
  INITIAL_RATE_INDEX,
  RATES,
  SAMPLE_EVERY_S,
  SKIP_S,
  advanceTri,
  barFraction,
  channelValue,
  chartChannels,
  chartX,
  eventLabel,
  eventsBetween,
  flows,
  formatHandsOffset,
  formatPower,
  formatRate,
  formatRatePerDay,
  formatShare,
  handsAheadS,
  heightForWidth,
  initialTriState,
  powerShares,
  rate,
  rateNote,
  rateSPerDay,
  rateValueText,
  readouts,
  reserveFraction,
  reserveH,
  setRateIndex,
  showsSecondsHand,
  skip,
  status,
  statusLine,
  stripY,
  timeLabels,
  triLayout,
  wind,
  type RunEventKind,
  type TriState,
} from '../../src/widgets/tri-synchro/logic.ts';
import { P, revS } from '../sim/helpers.ts';

const FRAME_S = 1 / 60;

/** PHYSICS.md, D7 and D13: the run-down from full wind, in averaged mode. */
const REGULATION_ENDS_S = 254_342;
const IC_OFF_S = 256_264;
const STOPS_S = 265_590;

function frames(state: TriState, count: number, dtS = FRAME_S): TriState {
  let s = state;
  for (let i = 0; i < count; i++) s = advanceTri(s, dtS, P);
  return s;
}

function value(s: TriState, label: string): string {
  const r = readouts(s, P).find((x) => x.label === label);
  if (!r) throw new Error(`no readout ${label}`);
  return r.value;
}

function eventTime(s: TriState, kind: RunEventKind): number {
  const e = s.events.find((x) => x.kind === kind);
  if (!e) throw new Error(`no ${kind} event`);
  return e.timeS;
}

/** The whole reserve, run to a stop and a little past it, once, at the widget's top speed, frame by frame. */
const LIVE_RUN = (() => {
  const top = setRateIndex(initialTriState(P), RATES.length - 1);
  // 74 h at 2 h/s is 37 s of page time.
  return frames(top, 37 * 60);
})();

/** The same by skipping, six hours a press, to 78 h. */
const SKIPPED_RUN = (() => {
  let s = initialTriState(P);
  for (let i = 0; i < 13; i++) s = skip(s, P);
  return s;
})();

describe('tri-synchro: opening', () => {
  it('opens just wound, at t = 0, regulated at 8 rev/s on the full-wind duty and supply PHYSICS.md derives', () => {
    const s = initialTriState(P);
    expect(s.sim.timeS).toBe(0);
    expect(s.sim.regime).toBe('regulated');
    expect(readouts(s, P).map((r) => r.value)).toEqual([
      '0.0 s',
      '1 h/s',
      // Full wind is exactly the published 72 h of turns at 8 rev/s (D1).
      '72.0 h',
      '8.000 rev/s',
      // D4 and D5: 11.2 % of the time shorted, 1.3400 V.
      '11.2 %',
      '1.340 V',
      '0.0 s',
      '0.0 s/day',
    ]);
    expect(statusLine(s)).toBe('IC: regulating');
    expect(s.history).toHaveLength(1);
    expect(s.events).toEqual([]);
  });

  it('opens at an hour a second, and draws the seconds hand only at a minute a second', () => {
    const s = initialTriState(P);
    expect(rate(s)).toBe(3600);
    expect(INITIAL_RATE_INDEX).toBe(2);
    expect(showsSecondsHand(s)).toBe(false);
    expect(showsSecondsHand(setRateIndex(s, 0))).toBe(true);
    expect(showsSecondsHand(setRateIndex(s, 1))).toBe(false);
  });
});

describe('tri-synchro: the run-down, frame by frame at 2 h/s', () => {
  // Events are booked at the end of the averaged step they fall in, and the
  // widget steps at most a second at a time, so each lands within a second
  // after the time D7 states. Frames of 120 s do not divide into whole
  // seconds exactly, so the step grid can drift by a rounding; a second
  // either side allows for it.
  it.each([
    ['regulation-ends', REGULATION_ENDS_S],
    ['ic-off', IC_OFF_S],
    ['stops', STOPS_S],
  ] as const)('marks %s at the %i s PHYSICS.md predicts, to within a step', (kind, timeS) => {
    expect(Math.abs(eventTime(LIVE_RUN, kind) - timeS)).toBeLessThanOrEqual(1.5);
  });

  it('passes through the three events once each, in order', () => {
    expect(LIVE_RUN.events.map((e) => e.kind)).toEqual(['regulation-ends', 'ic-off', 'stops']);
  });

  it('keeps perfect time and zero rate for as long as it regulates, with the power reserve falling an hour an hour', () => {
    let s = setRateIndex(initialTriState(P), RATES.length - 1);
    for (let h = 12; h <= 60; h += 12) {
      s = frames(s, 6 * 60);
      expect(s.sim.timeS / SECONDS_PER_HOUR).toBeCloseTo(h, 6);
      expect(status(s)).toBe('regulating');
      expect(value(s, 'Hands vs true time')).toBe('0.0 s');
      expect(value(s, 'Rate')).toBe('0.0 s/day');
      // Regulated, the barrel unwinds at a constant rate, so the gauge falls exactly as time passes.
      expect(reserveH(s, P)).toBeCloseTo(72 - h, 6);
    }
  });

  it('eases the brake off as the spring weakens: 11.2 % at full wind, 7.1 % at half, 3.1 % near the end', () => {
    let s = setRateIndex(initialTriState(P), RATES.length - 1);
    expect(s.sim.duty).toBeCloseTo(0.112, 3);
    s = frames(s, 18 * 60); // 36 h: half wind
    expect(s.sim.duty).toBeCloseTo(0.0713, 4);
    // Fraction 0.03, D4's low wind: (1 − 0.03) × 72 h.
    s = frames(s, Math.round(((0.97 * 72 - 36) / 2) * 60));
    expect(s.sim.duty).toBeCloseTo(0.0306, 3);
  });

  it('when regulation ends, the gauge still reads 1.35 h: it reads the spring, not what the spring can still do', () => {
    // D13: fraction 0.018741 × 72 h. Two seconds of unwinding either side move it by under 10⁻⁵ h.
    let s = initialTriState(P);
    for (let i = 0; i < 11; i++) s = skip(s, P); // 66 h
    // Run on at a minute a second, so each frame is a second of sim time, to the first frame regulation has ended in.
    s = setRateIndex(s, 0);
    while (s.events.length === 0) s = advanceTri(s, 1 / 60, P);
    expect(s.events[0]?.kind).toBe('regulation-ends');
    expect(reserveH(s, P)).toBeCloseTo(1.349, 3);
    expect(status(s)).toBe('running, not regulating');
    expect(s.sim.icOn).toBe(true);
  });

  it('after brownout the capacitor sits at the 0.891 V the unloaded wheel charges it to, short of the 1.0 V restart', () => {
    let s = initialTriState(P);
    for (let i = 0; i < 12; i++) s = skip(s, P); // 72 h: past brownout, before the stop
    expect(status(s)).toBe('off');
    expect(statusLine(s)).toBe('IC off: unregulated');
    expect(value(s, 'Supply voltage')).toBe('0.891 V');
    expect(value(s, 'Brake duty')).toBe('0.0 %');
    expect(s.sim.capVoltageV).toBeLessThan(P.icStartV);
  });

  it('stops at 73 h 46 min, with the hands at the 71.73 h the barrel turns give, 2.04 h behind', () => {
    const stoppedAt = eventTime(LIVE_RUN, 'stops');
    expect(stoppedAt / SECONDS_PER_HOUR).toBeCloseTo(73.775, 3);
    // Once stopped, the hands stay where they stopped, so their reading now is their reading then.
    const shownH = (LIVE_RUN.sim.timeS + handsAheadS(LIVE_RUN, P)) / SECONDS_PER_HOUR;
    // D8 and D13: (1 − 0.00374) × 72 h. PHYSICS.md gives it to 0.01 h.
    expect(shownH).toBeCloseTo(71.73, 2);
    expect((shownH * SECONDS_PER_HOUR - stoppedAt) / SECONDS_PER_HOUR).toBeCloseTo(-2.04, 2);
    expect(reserveH(LIVE_RUN, P)).toBeCloseTo(0.269, 3);
    expect(statusLine(LIVE_RUN)).toBe('Glide wheel stopped');
    expect(revS(LIVE_RUN.sim.rotorOmegaRadS)).toBe(0);
    // A stopped watch loses a day a day.
    expect(value(LIVE_RUN, 'Rate')).toBe('−86,400 s/day');
  });

  it('gives the same events and final state by skipping as by running live', () => {
    for (const kind of ['regulation-ends', 'ic-off', 'stops'] as const) {
      expect(Math.abs(eventTime(SKIPPED_RUN, kind) - eventTime(LIVE_RUN, kind))).toBeLessThanOrEqual(2);
    }
    expect(SKIPPED_RUN.sim.barrelAngleRad).toBeCloseTo(LIVE_RUN.sim.barrelAngleRad, 9);
  });

  it('is deterministic: the same frames give an identical state', () => {
    const a = frames(initialTriState(P), 300);
    const b = frames(initialTriState(P), 300);
    expect(a).toEqual(b);
  });
});

describe('tri-synchro: the chart record', () => {
  it('records a point every five minutes of sim time, and both sides of every event', () => {
    const regular = Math.floor(CHART_SPAN_S / SAMPLE_EVERY_S);
    // The opening point, the regular ones, and two for each of the three events.
    expect(SKIPPED_RUN.history.length).toBeLessThanOrEqual(1 + regular + 6);
    expect(SKIPPED_RUN.history.length).toBeGreaterThanOrEqual(regular);
    for (const e of SKIPPED_RUN.events) {
      const around = SKIPPED_RUN.history.filter((p) => Math.abs(p.timeS - e.timeS) <= 1);
      expect(around.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps its points in time order, and records nothing past the chart’s end however long it runs', () => {
    let s = SKIPPED_RUN;
    for (let i = 0; i < 4; i++) s = skip(s, P);
    expect(s.sim.timeS).toBeGreaterThan(CHART_SPAN_S + 20 * SECONDS_PER_HOUR);
    expect(s.history.length).toBe(SKIPPED_RUN.history.length);
    expect(s.history.every((p) => p.timeS <= CHART_SPAN_S)).toBe(true);
    for (let i = 1; i < s.history.length; i++) {
      expect(s.history[i]!.timeS).toBeGreaterThanOrEqual(s.history[i - 1]!.timeS);
    }
  });

  it('draws the duty as zero while the IC is off, whatever it last set', () => {
    const off = SKIPPED_RUN.history.filter((p) => p.timeS > eventTime(SKIPPED_RUN, 'ic-off'));
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((p) => p.duty === 0)).toBe(true);
  });

  it('fits every value the run passes through inside its strip', () => {
    const channels = chartChannels(P);
    for (const ch of channels) {
      for (const p of SKIPPED_RUN.history) {
        const v = channelValue(p, ch.channel);
        expect(v).toBeGreaterThanOrEqual(ch.min);
        expect(v).toBeLessThanOrEqual(ch.max);
      }
    }
  });

  it('eventsBetween sees each change once, and nothing in a step that changes nothing', () => {
    const s = initialTriState(P).sim;
    expect(eventsBetween(s, s)).toEqual([]);
    expect(eventsBetween(s, { ...s, regime: 'stalled', icOn: false })).toEqual(['regulation-ends', 'ic-off', 'stops']);
    expect(eventLabel('regulation-ends')).toBe('Regulation ends');
    expect(eventLabel('ic-off')).toBe('IC browns out');
    expect(eventLabel('stops')).toBe('Glide wheel stops');
  });
});

describe('tri-synchro: controls and awkward frames', () => {
  it('runs an hour of sim time for each second of page time at the opening rate', () => {
    // The first frame steps a full sixtieth here: advanceTri has no first-frame rule of its own.
    const s = frames(initialTriState(P), 60);
    expect(s.sim.timeS).toBeCloseTo(3600, 6);
  });

  it('survives a ten-minute frame gap as one clamped 0.1 s step: 6 min of sim time at 1 h/s', () => {
    const s = advanceTri(initialTriState(P), 600, P);
    expect(s.sim.timeS).toBeCloseTo(360, 9);
  });

  it('does nothing for a zero, negative, or NaN frame, and clamps an infinite one', () => {
    const s0 = initialTriState(P);
    expect(advanceTri(s0, 0, P)).toEqual(s0);
    expect(advanceTri(s0, -1, P)).toEqual(s0);
    expect(advanceTri(s0, Number.NaN, P)).toEqual(s0);
    expect(advanceTri(s0, Number.POSITIVE_INFINITY, P).sim.timeS).toBeCloseTo(360, 9);
  });

  it('winds fully and starts again from 0 h, with the chart cleared and the rate kept', () => {
    const s = wind(setRateIndex(SKIPPED_RUN, 0), P);
    expect(s.sim.timeS).toBe(0);
    expect(reserveH(s, P)).toBeCloseTo(72, 9);
    expect(s.sim.regime).toBe('regulated');
    expect(s.events).toEqual([]);
    expect(s.history).toHaveLength(1);
    expect(rate(s)).toBe(60);
  });

  it('skips six hours at once, whatever the rate', () => {
    expect(SKIP_S).toBe(6 * SECONDS_PER_HOUR);
    expect(skip(setRateIndex(initialTriState(P), 0), P).sim.timeS).toBe(SKIP_S);
  });

  it('maps the slider to its four rates, clamping and rounding what it is given', () => {
    const s = initialTriState(P);
    expect(RATES.map((r) => formatRate(r))).toEqual(['1 min/s', '10 min/s', '1 h/s', '2 h/s']);
    expect(RATES.map((r) => rateValueText(r))).toEqual([
      '1 minute each second',
      '10 minutes each second',
      '1 hour each second',
      '2 hours each second',
    ]);
    expect(rate(setRateIndex(s, 3))).toBe(7200);
    expect(rate(setRateIndex(s, 9))).toBe(7200);
    expect(rate(setRateIndex(s, -2))).toBe(60);
    expect(rate(setRateIndex(s, 0.6))).toBe(600);
    expect(rate(setRateIndex(s, Number.NaN))).toBe(3600);
    expect(setRateIndex(s, 2)).toBe(s);
  });
});

describe('tri-synchro: readouts', () => {
  it('formats the hands’ offset with a sign and a unit, in seconds under a minute and hours and minutes above', () => {
    expect(formatHandsOffset(0)).toBe('0.0 s');
    expect(formatHandsOffset(-1e-9)).toBe('0.0 s');
    expect(formatHandsOffset(3.25)).toBe('+3.3 s');
    expect(formatHandsOffset(-42.5)).toBe('−42.5 s');
    expect(formatHandsOffset(-2.04 * 3600)).toBe('−2 h 02 min');
    expect(formatHandsOffset(90)).toBe('+1 min 30 s');
  });

  it('formats the rate to a tenth while small and in whole seconds with separators when not', () => {
    expect(formatRatePerDay(0)).toBe('0.0 s/day');
    expect(formatRatePerDay(-0.04)).toBe('0.0 s/day');
    expect(formatRatePerDay(0.5)).toBe('+0.5 s/day');
    expect(formatRatePerDay(-40_190.4)).toBe('−40,190 s/day');
    expect(formatRatePerDay(1234)).toBe('+1,234 s/day');
  });

  it('gives the rate a day at this speed would gain or lose: zero on the reference, a day a day stopped', () => {
    const s = initialTriState(P);
    expect(rateSPerDay(s, P)).toBe(0);
    expect(rateSPerDay({ ...s, sim: { ...s.sim, rotorOmegaRadS: 0 } }, P)).toBe(-86_400);
  });

  it('says beside the rate that the model’s crystal is exact, and gives Seiko’s ±15 s/month for the 9R65', () => {
    expect(rateNote()).toContain('crystal is exact');
    expect(rateNote()).toContain('±15 s/month');
  });

  it('puts a unit on every readout, through the whole run', () => {
    for (const s of [initialTriState(P), LIVE_RUN, SKIPPED_RUN]) {
      for (const r of readouts(s, P)) expect(r.value).toMatch(/\u202f\S/);
    }
  });
});

describe('tri-synchro: the power panel', () => {
  it('splits what reaches the wheel at full wind into 29.4 % friction, 68.8 % brake, and 1.8 % electricity', () => {
    const f = flows(initialTriState(P), P);
    expect(formatPower(f.driveW)).toBe('1.63 µW');
    const shares = powerShares(f);
    expect(shares.map((x) => x.key)).toEqual(['friction', 'brake', 'charging']);
    expect(shares.map((x) => formatShare(x.share))).toEqual(['29.4 %', '68.8 %', '1.8 %']);
    expect(shares.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 12);
  });

  it('gives the brake nothing once regulation has ended, and friction everything once the IC is off', () => {
    let s = initialTriState(P);
    for (let i = 0; i < 12; i++) s = skip(s, P);
    const shares = powerShares(flows(s, P));
    expect(shares.map((x) => formatShare(x.share))).toEqual(['100.0 %', '0 %', '0 %']);
  });

  it('shows nothing, not a division by zero, when the wheel is stopped', () => {
    const f = flows(LIVE_RUN, P);
    expect(f.driveW).toBe(0);
    expect(powerShares(f).map((x) => x.share)).toEqual([0, 0, 0]);
    expect(formatPower(f.driveW)).toBe('0 W');
  });

  it('formats small powers in the unit that keeps them readable', () => {
    expect(formatPower(1.6289e-6)).toBe('1.63 µW');
    expect(formatPower(29.19e-9)).toBe('29.2 nW');
    expect(formatPower(3.1e-9)).toBe('3.10 nW');
    expect(formatPower(-1)).toBe('0 W');
    expect(formatShare(0)).toBe('0 %');
  });
});

describe('tri-synchro: geometry', () => {
  it('fills the reserve gauge from the published 72 h down to empty', () => {
    expect(reserveFraction(initialTriState(P), P)).toBe(1);
    expect(reserveFraction(LIVE_RUN, P)).toBeCloseTo(0.269 / 72, 4);
    expect(barFraction(5, 0)).toBe(0);
    expect(barFraction(-1, 10)).toBe(0);
    expect(barFraction(20, 10)).toBe(1);
  });

  it('puts the wind at the chart’s left edge and 78 h at its right, clamping beyond', () => {
    const box = { x: 30, y: 0, width: 300, height: 50 };
    expect(chartX(box, 0)).toBe(30);
    expect(chartX(box, CHART_SPAN_S)).toBe(330);
    expect(chartX(box, 2 * CHART_SPAN_S)).toBe(330);
    expect(chartX(box, -1)).toBe(30);
    expect(stripY(box, 0, 0, 10)).toBe(50);
    expect(stripY(box, 10, 0, 10)).toBe(0);
    expect(stripY(box, 12, 0, 10)).toBe(0);
    expect(stripY(box, Number.NaN, 0, 10)).toBe(50);
  });

  it('labels the time axis every 24 h, ending on the published 72 h', () => {
    expect(timeLabels().map((l) => l.text)).toEqual(['0 h', '24 h', '48 h', '72 h']);
  });

  it('marks 8 rev/s on the speed strip and the 0.6 V brownout on the supply strip', () => {
    const [speed, supply, duty] = chartChannels(P);
    expect(speed?.mark).toBe(8);
    expect(supply?.mark).toBe(P.icBrownoutV);
    expect(duty?.mark).toBeNull();
  });

  it.each([324, 380, 640, 800])('lays out at %i px with everything inside the width and nothing overlapping', (w) => {
    const l = triLayout(w);
    expect(heightForWidth(w)).toBe(l.height);
    expect(l.dial.cx + l.dial.radius).toBeLessThanOrEqual(l.panel.x);
    expect(l.dial.cx - l.dial.radius).toBeGreaterThan(0);
    for (const b of [...l.panel.bars, l.reserve, ...l.strips]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(w);
      expect(b.width).toBeGreaterThan(100);
    }
    expect(l.statusY).toBeLessThan(l.reserve.y - 20);
    expect(l.panel.bars.at(-1)!.y).toBeLessThan(l.reserve.y - 20);
    // Each strip's title row clears the bottom axis label of the strip above (half an 11 px line) and its own top one.
    for (let i = 1; i < l.strips.length; i++) {
      expect(l.strips[i]!.y - (l.strips[i - 1]!.y + l.strips[i - 1]!.height)).toBeGreaterThanOrEqual(30);
    }
    expect(l.eventsY).toBeGreaterThan(l.strips.at(-1)!.y + l.strips.at(-1)!.height);
    expect(l.height).toBeGreaterThan(l.eventsY);
  });

  it('draws nothing at zero width rather than negative sizes', () => {
    const l = triLayout(0);
    expect(l.dial.radius).toBe(0);
    expect(l.strips.every((b) => b.width >= 0)).toBe(true);
  });
});
