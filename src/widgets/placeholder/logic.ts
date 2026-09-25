// Everything the placeholder widget decides, other than drawing. The widget
// exists to prove the runtime (mounting, the scheduler, the palette, the
// canvas) before any physics does, and it is replaced by real widgets from
// M3 on. It simulates nothing, and its readouts say so.

import { revSToRadS, wrapAngleRad } from '../../sim/units.ts';

/**
 * How fast the marker turns. A display rate, not a physical quantity: slow
 * enough to follow by eye, fast enough that a stalled scheduler is obvious in
 * a screenshot diff or a test.
 */
export const PLACEHOLDER_SPIN_REV_S = 0.5;

export interface PlaceholderState {
  elapsedS: number;
  angleRad: number;
  /** Frames that advanced the widget. The e2e tests read this to prove pausing. */
  ticks: number;
}

export const initialState: PlaceholderState = {
  elapsedS: 0,
  angleRad: 0,
  ticks: 0,
};

export function advance(state: PlaceholderState, dtS: number): PlaceholderState {
  return {
    elapsedS: state.elapsedS + dtS,
    angleRad: wrapAngleRad(state.angleRad + revSToRadS(PLACEHOLDER_SPIN_REV_S) * dtS),
    ticks: state.ticks + 1,
  };
}

// A narrow no-break space (U+202F) joins value and unit, as SI style asks,
// and stops a readout wrapping between the two at 380 px.
const UNIT_SPACE = '\u202f';

export function formatElapsed(elapsedS: number): string {
  return `${elapsedS.toFixed(1)}${UNIT_SPACE}s`;
}

export function formatSpinRate(revS: number): string {
  return `${revS.toFixed(2)}${UNIT_SPACE}rev/s`;
}

export interface Readout {
  label: string;
  value: string;
}

export function readouts(state: PlaceholderState): Readout[] {
  return [
    { label: 'Elapsed', value: formatElapsed(state.elapsedS) },
    { label: 'Marker speed', value: formatSpinRate(PLACEHOLDER_SPIN_REV_S) },
  ];
}

/** Canvas height for a given width: squarer on a phone, wider on a desktop. */
export function heightForWidth(cssWidth: number): number {
  const MIN_HEIGHT_PX = 160;
  const MAX_HEIGHT_PX = 240;
  return Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, cssWidth * 0.5));
}

export interface WheelGeometry {
  cx: number;
  cy: number;
  radius: number;
  markerX: number;
  markerY: number;
}

/**
 * Where to draw the wheel and its marker in a canvas of the given CSS size.
 * Angle zero points up, and positive angles turn clockwise, like a watch hand.
 */
export function wheelGeometry(cssWidth: number, cssHeight: number, angleRad: number): WheelGeometry {
  const MARGIN_PX = 12;
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  const radius = Math.max(0, Math.min(cssWidth, cssHeight) / 2 - MARGIN_PX);
  return {
    cx,
    cy,
    radius,
    markerX: cx + radius * Math.sin(angleRad),
    markerY: cy - radius * Math.cos(angleRad),
  };
}
