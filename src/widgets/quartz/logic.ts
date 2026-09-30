// Everything the quartz widget decides, other than drawing. The crystal
// swings 32,768 times a second, and the IC's divider chain halves that twelve
// times, to the 8 Hz reference. The widget draws every stage's output as a
// trace on a logic analyser, crystal at the top and reference at the bottom,
// so each row is visibly half the frequency of the row above it.
//
// Nothing at 32,768 Hz can be shown at a display's 60 frames a second, so the
// primary control slows the crystal down by powers of two, from real time,
// where only the last few stages can be drawn, to 1/4,096 of it, where the
// crystal swings as slowly as the reference ticks in real time. A trace too
// fast to draw at the chosen speed is shaded rather than drawn, as the
// runaway's wheel is blurred rather than aliased (decision 28).
//
// The model's crystal is exact (decision 26), so the whole picture is a pure
// function of how many cycles it has made: the stage outputs are the bits of
// that count (src/sim/quartz.ts, PHYSICS.md D11). The state is the count.

import {
  counterValue,
  cyclesPerReferenceTick,
  dividerChainHz,
  referenceTicks,
  stageHalfPeriodCycles,
  stageLevel,
} from '../../sim/quartz.ts';
import type { SimParams } from '../../sim/types.ts';
import { TAU } from '../../sim/units.ts';
import { formatCount, formatDuration, formatPlayback, formatShortTime, withUnit } from '../shared/format.ts';
import type { Readout } from '../shared/shell.ts';

/**
 * The diagram shows the last second of page time, whatever the speed, so
 * the traces always scroll across it at the same pace and a slower crystal
 * shows fewer, wider cycles. At real time that second holds eight
 * reference ticks.
 */
export const WINDOW_PAGE_S = 1;

/**
 * A level held for less than this many CSS pixels is not drawn: at 3 px a
 * square wave is still legible as one, and below it the edges merge into a
 * grey smear that moves by whole cycles between frames (the wagon-wheel
 * effect again). Such a trace is shaded instead.
 */
export const MIN_HALF_PERIOD_PX = 3;

/**
 * The fork is drawn swinging only while the crystal, as slowed, makes at
 * most this many swings a second. At 60 frames a second that is six frames
 * or more a swing, the fewest that read as motion rather than flicker.
 * Faster, the tines are drawn as the blur a camera would record.
 */
export const FORK_SHARP_MAX_HZ = 10;

/** The widget opens slowed 2⁶ = 64 times, with the slider in the middle of its range. */
export const INITIAL_SLOW_EXPONENT = 6;

export interface QuartzState {
  /** Crystal cycles since the widget opened. Not necessarily whole: time is continuous, the count is its floor. */
  cycles: number;
  /** The crystal runs at 2^−slowExponent of real time. */
  slowExponent: number;
}

export function initialQuartzState(): QuartzState {
  return { cycles: 0, slowExponent: INITIAL_SLOW_EXPONENT };
}

/**
 * The slowest setting shows the crystal at the reference's own rate, so the
 * slider's range is the length of the divider chain: 12 stages, 2¹² = 4,096.
 */
export function maxSlowExponent(params: SimParams): number {
  return params.referenceDividerStages;
}

export function playbackRate(state: QuartzState): number {
  return 2 ** -state.slowExponent;
}

export function setSlowExponent(state: QuartzState, exponent: number, params: SimParams): QuartzState {
  const e = Number.isFinite(exponent) ? Math.round(exponent) : state.slowExponent;
  return { ...state, slowExponent: Math.max(0, Math.min(maxSlowExponent(params), e)) };
}

/** Advance by `dtS` of page time, which is sim time scaled by the playback rate. */
export function advanceQuartz(state: QuartzState, dtS: number, params: SimParams): QuartzState {
  const stepS = Number.isFinite(dtS) ? Math.max(0, dtS) : 0;
  return { ...state, cycles: state.cycles + stepS * playbackRate(state) * params.quartzHz };
}

/** Crystal cycles across the diagram's window at the current speed. */
export function windowCycles(state: QuartzState, params: SimParams): number {
  return WINDOW_PAGE_S * playbackRate(state) * params.quartzHz;
}

/** How often each stage's output cycles on screen at the current speed, Hz of page time. */
export function onScreenHz(state: QuartzState, stage: number, params: SimParams): number {
  return (dividerChainHz(params)[stage] ?? 0) * playbackRate(state);
}

// Traces -----------------------------------------------------------------------

/** From `x` rightwards, until the next step, the trace is at `level`. */
export interface Step {
  x: number;
  level: 0 | 1;
}

export type Trace = { kind: 'wave'; steps: Step[] } | { kind: 'shaded' };

/**
 * Stage `stage`'s output over the window ending now, across `widthPx`: its
 * level at the window's left edge, then one step per edge, oldest first.
 * Shaded if its levels would be narrower than MIN_HALF_PERIOD_PX.
 */
export function stageTrace(state: QuartzState, stage: number, widthPx: number, params: SimParams): Trace {
  const span = windowCycles(state, params);
  const h = stageHalfPeriodCycles(stage);
  if (!(widthPx > 0) || (widthPx * h) / span < MIN_HALF_PERIOD_PX) return { kind: 'shaded' };
  const start = state.cycles - span;
  const steps: Step[] = [{ x: 0, level: stageLevel(start, stage) }];
  // Edges fall on whole multiples of the half-period, which are exact in binary.
  for (let k = Math.floor(start / h) + 1; k * h <= state.cycles; k++) {
    steps.push({ x: ((k * h - start) / span) * widthPx, level: stageLevel(k * h, stage) });
  }
  return { kind: 'wave', steps };
}

/**
 * Where the counter rolled over inside the window, as x across `widthPx`,
 * oldest first: the reference ticks, where every divider falls at once.
 */
export function tickMarksX(state: QuartzState, widthPx: number, params: SimParams): number[] {
  const span = windowCycles(state, params);
  const n = cyclesPerReferenceTick(params);
  const start = state.cycles - span;
  const out: number[] = [];
  for (let k = Math.floor(start / n) + 1; k * n <= state.cycles; k++) out.push(((k * n - start) / span) * widthPx);
  return out;
}

/** Each stage's level now, or null where its trace is shaded and a lamp would only flicker. */
export function levelsNow(state: QuartzState, widthPx: number, params: SimParams): (0 | 1 | null)[] {
  return dividerChainHz(params).map((_, stage) =>
    stageTrace(state, stage, widthPx, params).kind === 'shaded' ? null : stageLevel(state.cycles, stage),
  );
}

// The crystal ------------------------------------------------------------------

export interface ForkDrawing {
  /** The tines' spread, −1 (closest) to 1 (widest), in the drawing's exaggerated scale. */
  spread: number;
  /** Drawn as a blur between −1 and 1, because the swing is too fast to follow. */
  blurred: boolean;
}

/**
 * The crystal's tines at the current count. The tines swing sinusoidally,
 * and the oscillator squares that swing into stage 0's output: widest a
 * quarter of the way into the high half, closest a quarter into the low.
 */
export function forkDrawing(state: QuartzState, params: SimParams): ForkDrawing {
  return {
    spread: -Math.sin(TAU * state.cycles),
    blurred: onScreenHz(state, 0, params) > FORK_SHARP_MAX_HZ,
  };
}

// Readouts ---------------------------------------------------------------------

/** How long a reference tick takes on screen at the current speed, with units. */
export function tickIntervalText(state: QuartzState, params: SimParams): string {
  const s = 1 / onScreenHz(state, params.referenceDividerStages, params);
  if (s >= 60) return formatDuration(s);
  return withUnit(s, s < 1 ? 3 : 0, 's');
}

export function readouts(state: QuartzState, params: SimParams): Readout[] {
  const perTick = cyclesPerReferenceTick(params);
  return [
    { label: 'Playback', value: `${formatPlayback(playbackRate(state))} real time` },
    { label: 'Crystal, on screen', role: 'crystal', value: `${formatCount(onScreenHz(state, 0, params))}\u202fHz` },
    { label: 'A reference tick every', role: 'reference', value: tickIntervalText(state, params) },
    // The range goes in the label, so the value is short enough for one line at 380 px.
    {
      label: `Counter, 0 to ${formatCount(perTick - 1)}`,
      role: 'ic',
      value: `${formatCount(counterValue(state.cycles, params))}\u202fcycles`,
    },
    {
      label: 'Reference ticks given',
      role: 'reference',
      value: `${formatCount(referenceTicks(state.cycles, params))}\u202fticks`,
    },
  ] as const;
}

/** What the slider announces: the speed against real time. */
export function slowValueText(exponent: number): string {
  return exponent <= 0 ? 'real time' : `1/${formatCount(2 ** exponent)} of real time`;
}

/** The window's left edge, in sim time before now, for the diagram's time axis. */
export function windowStartText(state: QuartzState): string {
  return formatShortTime(-WINDOW_PAGE_S * playbackRate(state));
}

// Layout -------------------------------------------------------------------------

export interface QuartzLayout {
  /** The crystal: where its stem's foot sits, and the size of its tines. */
  fork: { cx: number; baseY: number; tineLength: number; tineWidth: number; gap: number; swing: number };
  /** The traces' left edge and width; rows start at `top`, one per stage, `rowPitch` apart. */
  traces: { x: number; width: number; top: number; rowPitch: number };
  /** The diagram's left edge, where its title starts. */
  diagramLeft: number;
  /** The right edge of the frequency labels, left of the traces. */
  labelRight: number;
  /** The centre of the "now" lamps, right of the traces. */
  lampX: number;
  wide: boolean;
  height: number;
}

const MARGIN_PX = 12;
/** Below this width the crystal goes above the diagram rather than beside it. */
export const WIDE_MIN_PX = 520;
const FORK_COLUMN_PX = 150;
const FORK_BLOCK_NARROW_PX = 110;
/** The width of the crystal's name beside it on a phone, "swing exaggerated" at 12 px, rounded up. */
const FORK_NAME_NARROW_PX = 130;
/** Room above the rows for the title, and below them for the time axis. */
const TITLE_PX = 24;
const TIME_AXIS_PX = 22;
/** Room for "32,768 Hz" left of the traces, and for the lamps right of them. */
const LABEL_COLUMN_PX = 70;
const LAMP_COLUMN_PX = 20;
export const ROW_PITCH_PX = 20;

export function quartzLayout(cssWidth: number, params: SimParams): QuartzLayout {
  const width = Math.max(0, cssWidth);
  const wide = width >= WIDE_MIN_PX;
  const rows = params.referenceDividerStages + 1;
  const diagramLeft = wide ? FORK_COLUMN_PX : MARGIN_PX;
  const top = (wide ? MARGIN_PX : FORK_BLOCK_NARROW_PX) + TITLE_PX;
  const height = Math.ceil(top + rows * ROW_PITCH_PX + TIME_AXIS_PX + MARGIN_PX / 2);
  const x = diagramLeft + LABEL_COLUMN_PX;
  const traceWidth = Math.max(0, width - MARGIN_PX - LAMP_COLUMN_PX - x);
  const tineLength = wide ? 70 : 46;
  const fork = {
    // On a phone the name sits right of the fork, so the pair is centred together.
    cx: wide ? FORK_COLUMN_PX / 2 : width / 2 - FORK_NAME_NARROW_PX / 2,
    baseY: wide ? MARGIN_PX + TITLE_PX + tineLength + 60 : MARGIN_PX + tineLength + 24,
    tineLength,
    tineWidth: wide ? 9 : 7,
    gap: wide ? 12 : 9,
    swing: wide ? 7 : 5,
  };
  return {
    fork,
    traces: { x, width: traceWidth, top, rowPitch: ROW_PITCH_PX },
    diagramLeft,
    labelRight: x - 8,
    lampX: x + traceWidth + LAMP_COLUMN_PX / 2 + 2,
    wide,
    height,
  };
}

export function heightForWidth(cssWidth: number, params: SimParams): number {
  return quartzLayout(cssWidth, params).height;
}

/** The vertical centre of a stage's row. */
export function rowCentreY(layout: QuartzLayout, stage: number): number {
  return layout.traces.top + layout.traces.rowPitch * (stage + 0.5);
}
