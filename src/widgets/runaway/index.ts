import type { CanvasSize } from '../../runtime/canvas.ts';
import { createButton, createToggle } from '../../runtime/controls.ts';
import type { Theme } from '../../runtime/palette.ts';
import { getScheduler, type Scheduler } from '../../runtime/scheduler.ts';
import { DEFAULT_PARAMS } from '../../sim/params.ts';
import type { SimParams } from '../../sim/types.ts';
import { TAU, radSToRevS, wrapAngleRad } from '../../sim/units.ts';
import { handAngles, polar } from '../shared/dial.ts';
import { drawArbor, drawDialFace, drawHand, labelFont } from '../shared/draw.ts';
import { withUnit } from '../shared/format.ts';
import { createShell } from '../shared/shell.ts';
import {
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
  speedScaleMaxRevS,
  trueS,
  wind,
  woundFraction,
  type Bar,
  type RunawayState,
} from './logic.ts';

export interface Options {
  /** Injected by tests. Widgets on the page share the page's scheduler. */
  scheduler?: Scheduler;
  params?: SimParams;
}

export function mount(el: HTMLElement, opts: Options = {}): () => void {
  const params = opts.params ?? DEFAULT_PARAMS;
  const scaleMaxRevS = speedScaleMaxRevS(params);
  const targetRevS = radSToRevS(params.rotorTargetOmegaRadS);
  let state: RunawayState = initialRunawayState(params);

  const shell = createShell({
    el,
    scheduler: opts.scheduler ?? getScheduler(),
    className: 'widget-runaway',
    name: 'the runaway glide wheel',
    canvasLabel:
      'A glide wheel driven by a mainspring with no brake, beside a watch dial whose hands it drives, with faint hands showing true time. Bars below show the wheel’s speed against the 8 revolutions a second that keeps time, and how much of the mainspring is left.',
    heightForWidth,
    advance: (dtS) => {
      state = advanceRunaway(state, dtS, params);
    },
    draw,
    readouts: () => readouts(state, params),
  });

  const windButton = createButton({
    label: 'Wind',
    ariaLabel: 'Wind the mainspring fully and set the hands to 12:00',
    onPress: () => {
      state = wind(state, params);
      shell.render();
    },
  });
  const fastForward = createToggle({
    label: 'Fast-forward, 1 h/s',
    ariaLabel: 'Fast-forward, one hour each second',
    onChange: (on) => {
      state = setFastForward(state, on, params);
      shell.render();
    },
  });
  shell.controls.append(windButton, fastForward.element);

  function draw(ctx: CanvasRenderingContext2D, size: CanvasSize, t: Theme): void {
    const layout = runawayLayout(size.cssWidth);
    if (layout.rotor.radius <= 0) return;
    drawRotor(ctx, layout.rotor, t);
    drawDial(ctx, layout.dial, t);
    drawBar(ctx, layout.speedBar, barFraction(radSToRevS(rotorOmegaRadS(state)), scaleMaxRevS), t.parts.rotor, t);
    label(ctx, layout.speedBar, 'Glide wheel speed', t);
    // The speed scale's low end is where the "keeps time" note goes instead.
    scale(ctx, layout.speedBar, null, withUnit(scaleMaxRevS, 0, 'rev/s'), t);
    const targetX = layout.speedBar.x + barFraction(targetRevS, scaleMaxRevS) * layout.speedBar.width;
    ctx.strokeStyle = t.ui.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetX, layout.speedBar.y - 4);
    ctx.lineTo(targetX, layout.speedBar.y + layout.speedBar.height + 4);
    ctx.stroke();
    ctx.fillStyle = t.ui.text;
    ctx.font = labelFont(12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `${withUnit(targetRevS, 0, 'rev/s')} keeps time`,
      targetX + 4,
      layout.speedBar.y + layout.speedBar.height + 4,
    );

    drawBar(ctx, layout.springBar, woundFraction(state, params), t.parts.mainspring, t);
    label(ctx, layout.springBar, 'Mainspring', t);
    scale(ctx, layout.springBar, 'let down', 'fully wound', t);
  }

  function drawRotor(ctx: CanvasRenderingContext2D, r: { cx: number; cy: number; radius: number }, t: Theme) {
    const radius = r.radius * 0.8;
    ctx.fillStyle = t.ui.background;
    ctx.strokeStyle = t.parts.rotor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(r.cx, r.cy, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();

    const b = blur(state.sweepRad);
    const angle = wrapAngleRad(rotorAngleRad(state));
    ctx.strokeStyle = t.parts.rotor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.globalAlpha = b.alpha;
    for (let c = 0; c < b.copies; c++) {
      for (let s = 0; s < SPOKE_COUNT; s++) {
        const a = angle - c * b.stepRad + (s * TAU) / SPOKE_COUNT;
        const inner = polar(r.cx, r.cy, radius * 0.15, a);
        const outer = polar(r.cx, r.cy, radius * 0.92, a);
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(outer.x, outer.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    drawArbor(ctx, r.cx, r.cy, radius * 0.12, t.parts.rotor);
  }

  function drawDial(ctx: CanvasRenderingContext2D, d: { cx: number; cy: number; radius: number }, t: Theme) {
    drawDialFace(ctx, d.cx, d.cy, d.radius, t);
    const truth = handAngles(trueS(state));
    const watch = handAngles(shownS(state, params));
    // At an hour a second, a seconds hand turns 60 times a second: faster
    // than any frame rate can show, so fast-forward leaves it off.
    const seconds = !isFastForward(state);
    const ghost = t.ui.grid;
    drawHand(ctx, d.cx, d.cy, d.radius, truth.hourRad, { colour: ghost, widthPx: 4, length: 0.5 });
    drawHand(ctx, d.cx, d.cy, d.radius, truth.minuteRad, { colour: ghost, widthPx: 3, length: 0.78 });
    if (seconds) drawHand(ctx, d.cx, d.cy, d.radius, truth.secondRad, { colour: ghost, widthPx: 1.5, length: 0.92 });
    drawHand(ctx, d.cx, d.cy, d.radius, watch.hourRad, { colour: t.parts.hand, widthPx: 4, length: 0.5, tail: 0.1 });
    drawHand(ctx, d.cx, d.cy, d.radius, watch.minuteRad, { colour: t.parts.hand, widthPx: 3, length: 0.78, tail: 0.1 });
    if (seconds) {
      drawHand(ctx, d.cx, d.cy, d.radius, watch.secondRad, {
        colour: t.parts.rotor,
        widthPx: 1.5,
        length: 0.92,
        tail: 0.18,
      });
    }
    drawArbor(ctx, d.cx, d.cy, 3, t.parts.hand);
  }

  function drawBar(ctx: CanvasRenderingContext2D, bar: Bar, fraction: number, colour: string, t: Theme) {
    ctx.fillStyle = t.ui.grid;
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
    ctx.fillStyle = colour;
    ctx.fillRect(bar.x, bar.y, bar.width * fraction, bar.height);
  }

  function label(ctx: CanvasRenderingContext2D, bar: Bar, text: string, t: Theme) {
    ctx.fillStyle = t.ui.text;
    ctx.font = labelFont(13, 600);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, bar.x, bar.y - 5);
  }

  function scale(ctx: CanvasRenderingContext2D, bar: Bar, low: string | null, high: string, t: Theme) {
    ctx.fillStyle = t.ui.muted;
    ctx.font = labelFont(12);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillText(high, bar.x + bar.width, bar.y + bar.height + 4);
    ctx.textAlign = 'left';
    if (low !== null) ctx.fillText(low, bar.x, bar.y + bar.height + 4);
  }

  return shell.destroy;
}
