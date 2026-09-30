import type { CanvasSize } from '../../runtime/canvas.ts';
import { createSlider, createToggle } from '../../runtime/controls.ts';
import type { Theme } from '../../runtime/palette.ts';
import { getScheduler, type Scheduler } from '../../runtime/scheduler.ts';
import { emfV } from '../../sim/generator.ts';
import { DEFAULT_PARAMS } from '../../sim/params.ts';
import type { SimParams } from '../../sim/types.ts';
import { TAU, radSToRevS, wrapAngleRad } from '../../sim/units.ts';
import { drawCoil, drawMagnet, labelFont } from '../shared/draw.ts';
import { withUnit } from '../shared/format.ts';
import { colours } from '../shared/colours.ts';
import { createShell } from '../shared/shell.ts';
import {
  SCOPE_WINDOW_S,
  SPEED_STEP_REV_S,
  advanceGenerator,
  emfTrace,
  generatorLayout,
  heightForWidth,
  initialGeneratorState,
  readouts,
  rotorAngleRad,
  rotorOmegaRadS,
  scopeGridV,
  scopePoint,
  scopeScaleV,
  setSlowMotion,
  setSpeed,
  speedMaxRevS,
  speedValueText,
  type Box,
  type GeneratorState,
} from './logic.ts';

export interface Options {
  /** Injected by tests. Widgets on the page share the page's scheduler. */
  scheduler?: Scheduler;
  params?: SimParams;
}

export function mount(el: HTMLElement, opts: Options = {}): () => void {
  const params = opts.params ?? DEFAULT_PARAMS;
  const scaleV = scopeScaleV(params);
  const grid = scopeGridV(scaleV);
  let state: GeneratorState = initialGeneratorState(params);
  // Whether sim time is moving decides how a speed change is shown (see setSpeed).
  let live = false;

  const shell = createShell({
    el,
    scheduler: opts.scheduler ?? getScheduler(),
    className: 'widget-generator',
    name: 'the generator',
    canvasLabel:
      'The glide wheel’s two-pole magnet turning under the coil, and a scope tracing the EMF induced in the coil over the last half second. The trace is a wave that grows taller and more tightly packed as the wheel turns faster.',
    heightForWidth,
    advance: (dtS) => {
      state = advanceGenerator(state, dtS);
    },
    draw,
    readouts: () => readouts(state, params),
    onStatus: (status) => {
      live = status.ticking;
    },
  });

  const speed = createSlider({
    label: 'Glide wheel speed',
    min: 0,
    max: speedMaxRevS(params),
    step: SPEED_STEP_REV_S,
    initial: radSToRevS(rotorOmegaRadS(state)),
    valueText: speedValueText,
    onInput: (revS) => {
      state = setSpeed(state, revS, live);
      shell.render();
    },
  });
  const slow = createToggle({
    label: 'Slow motion',
    ariaLabel: 'Slow motion for the generator, one eighth of real time',
    onChange: (on) => {
      state = setSlowMotion(state, on);
      shell.render();
    },
  });
  shell.controls.append(slow.element, speed.element);

  function draw(ctx: CanvasRenderingContext2D, size: CanvasSize, t: Theme): void {
    const layout = generatorLayout(size.cssWidth);
    if (layout.wheel.radius <= 0 || layout.scope.width <= 0) return;
    drawCoil(ctx, layout.coil, t);
    drawMagnet(
      ctx,
      layout.wheel,
      {
        angleRad: wrapAngleRad(rotorAngleRad(state)),
        sweepRad: state.sweepRad,
        polePairs: params.generatorPolePairs,
      },
      t,
    );
    drawScope(ctx, layout.scope, t);
  }

  function drawScope(ctx: CanvasRenderingContext2D, box: Box, t: Theme) {
    // The EMF is the coil's, so its trace, mean, and title take the coil's colour.
    const emf = colours(t).coil;
    ctx.fillStyle = t.ui.background;
    ctx.fillRect(box.x, box.y, box.width, box.height);

    ctx.font = labelFont(12);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    for (const v of grid) {
      const y = scopePoint(box, 0, 2, v, scaleV).y;
      ctx.strokeStyle = v === 0 ? t.ui.muted : t.ui.grid;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.width, y);
      ctx.stroke();
      if (v % 2 === 0 || grid.length <= 5) {
        ctx.fillStyle = t.ui.muted;
        ctx.fillText(withUnit(v, 0, 'V'), box.x - 4, y);
      }
    }

    ctx.fillStyle = emf;
    ctx.font = labelFont(13, 600);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('EMF across the coil', box.x, box.y - 5);

    // A legend for the dashed line, on the title row, so it never covers the trace.
    ctx.font = labelFont(12);
    ctx.textAlign = 'right';
    const legendRight = box.x + box.width;
    ctx.fillText('rectified mean', legendRight, box.y - 5);
    const dashRight = legendRight - ctx.measureText('rectified mean').width - 6;
    ctx.strokeStyle = emf;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(dashRight - 20, box.y - 10);
    ctx.lineTo(dashRight, box.y - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = t.ui.muted;
    ctx.font = labelFont(12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(withUnit(-SCOPE_WINDOW_S, 1, 's'), box.x, box.y + box.height + 4);
    ctx.textAlign = 'right';
    ctx.fillText('now', box.x + box.width, box.y + box.height + 4);

    // The rectified mean, k_e·ω, the figure the EMF is quoted by (D4). The
    // capacitor charges from the peaks instead (D5), which the scope shows.
    const mean = emfV(rotorOmegaRadS(state), params);
    if (mean > 0) {
      const y = scopePoint(box, 0, 2, mean, scaleV).y;
      ctx.strokeStyle = emf;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // One sample per CSS pixel: at the top speed a cycle is 20 px wide on a phone.
    const n = Math.max(2, Math.round(box.width) + 1);
    const trace = emfTrace(state, params, n);
    ctx.strokeStyle = emf;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    trace.forEach((v, i) => {
      const p = scopePoint(box, i, n, v, scaleV);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    const now = scopePoint(box, n - 1, n, trace[n - 1] ?? 0, scaleV);
    ctx.fillStyle = emf;
    ctx.beginPath();
    ctx.arc(now.x, now.y, 4, 0, TAU);
    ctx.fill();
  }

  return shell.destroy;
}
