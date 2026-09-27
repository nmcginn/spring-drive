// Canvas drawing shared by the widgets. Rendering only: every number drawn
// comes from a pure function elsewhere, and every colour from the palette.

import type { Theme } from '../../runtime/palette.ts';
import { DIAL_MARKS, polar } from './dial.ts';
import { poleLettersVisible, poleRepeatRad, poleSectors } from './magnet.ts';
import { blur } from './motion.ts';

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

export interface WheelGeometry {
  cx: number;
  cy: number;
  radius: number;
}

export interface BoxGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The coil's core with turns of wire across it, and its name to the right. */
export function drawCoil(ctx: CanvasRenderingContext2D, c: BoxGeometry, t: Theme): void {
  ctx.fillStyle = t.ui.background;
  ctx.strokeStyle = t.parts.coil;
  ctx.lineWidth = 2;
  ctx.fillRect(c.x, c.y, c.width, c.height);
  ctx.strokeRect(c.x, c.y, c.width, c.height);
  const turns = 7;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 1; i <= turns; i++) {
    const x = c.x + (c.width * i) / (turns + 1);
    ctx.moveTo(x - c.height * 0.15, c.y);
    ctx.lineTo(x + c.height * 0.15, c.y + c.height);
  }
  ctx.stroke();
  ctx.fillStyle = t.parts.coil;
  ctx.font = labelFont(13, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('coil', c.x + c.width + 6, c.y + c.height / 2);
}

/** A sector of the wheel. Dial angles run clockwise from 12; the canvas's arc runs clockwise from 3. */
function wedge(ctx: CanvasRenderingContext2D, w: WheelGeometry, from: number, to: number): void {
  ctx.beginPath();
  ctx.moveTo(w.cx, w.cy);
  ctx.arc(w.cx, w.cy, w.radius, from - Math.PI / 2, to - Math.PI / 2);
  ctx.closePath();
}

export interface MagnetDrawing {
  /** The wheel's angle, wrapped, clockwise from 12 o'clock. */
  angleRad: number;
  /** How far it turned over the last frame, for the motion blur. */
  sweepRad: number;
  polePairs: number;
}

/**
 * The glide wheel's magnet: north poles filled, south poles left open, with
 * N and S lettered when the wheel turns slowly enough to read them, smeared
 * over its last frame's turn when it does not, and named underneath.
 */
export function drawMagnet(ctx: CanvasRenderingContext2D, w: WheelGeometry, m: MagnetDrawing, t: Theme): void {
  const b = blur(m.sweepRad, poleRepeatRad(m.polePairs));
  ctx.fillStyle = t.ui.background;
  ctx.beginPath();
  ctx.arc(w.cx, w.cy, w.radius, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = t.parts.rotor;
  ctx.globalAlpha = b.alpha;
  for (let c = 0; c < b.copies; c++) {
    for (const s of poleSectors(m.angleRad - c * b.stepRad, m.polePairs)) {
      if (!s.north) continue;
      wedge(ctx, w, s.fromRad, s.toRad);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = t.parts.rotor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w.cx, w.cy, w.radius, 0, 2 * Math.PI);
  ctx.stroke();

  if (poleLettersVisible(m.sweepRad)) {
    ctx.font = labelFont(Math.max(12, w.radius * 0.28), 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of poleSectors(m.angleRad, m.polePairs)) {
      const p = polar(w.cx, w.cy, w.radius * 0.6, (s.fromRad + s.toRad) / 2);
      ctx.fillStyle = s.north ? t.ui.background : t.parts.rotor;
      ctx.fillText(s.north ? 'N' : 'S', p.x, p.y);
    }
  }
  drawArbor(ctx, w.cx, w.cy, Math.max(3, w.radius * 0.08), t.parts.hand);
  ctx.fillStyle = t.parts.rotor;
  ctx.font = labelFont(13, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('glide wheel', w.cx, w.cy + w.radius + 4);
}
