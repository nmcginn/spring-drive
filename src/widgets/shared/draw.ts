// Canvas drawing shared by the widgets. Rendering only: every number drawn
// comes from a pure function elsewhere, and every colour from the palette.

import type { Theme } from '../../runtime/palette.ts';
import { DIAL_MARKS, polar } from './dial.ts';

/** Canvas text in the body face, falling back as the page's CSS does. */
export function labelFont(sizePx: number, weight = 400): string {
  return `${weight} ${sizePx}px Jost, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
}

/** Monospace, for numbers drawn on a canvas, as in the DOM readouts. */
export function monoFont(sizePx: number): string {
  return `${sizePx}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
}

/** A dial: the chapter ring and its 60 minute marks, longer at the hours. */
export function drawDialFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: Theme): void {
  ctx.fillStyle = t.ui.background;
  ctx.strokeStyle = t.ui.grid;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = t.ui.muted;
  for (const mark of DIAL_MARKS) {
    const inner = polar(cx, cy, radius * (mark.major ? 0.84 : 0.9), mark.angleRad);
    const outer = polar(cx, cy, radius * 0.96, mark.angleRad);
    ctx.lineWidth = mark.major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y);
    ctx.lineTo(outer.x, outer.y);
    ctx.stroke();
  }
}

export interface HandStyle {
  colour: string;
  widthPx: number;
  /** Length as a fraction of the dial radius. */
  length: number;
  /** Counterweight past the arbor, as a fraction of the radius. */
  tail?: number;
}

export function drawHand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angleRad: number,
  style: HandStyle,
): void {
  const tip = polar(cx, cy, radius * style.length, angleRad);
  const tail = polar(cx, cy, -radius * (style.tail ?? 0), angleRad);
  ctx.strokeStyle = style.colour;
  ctx.lineWidth = style.widthPx;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
}

export function drawArbor(ctx: CanvasRenderingContext2D, cx: number, cy: number, radiusPx: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, 0, 2 * Math.PI);
  ctx.fill();
}
