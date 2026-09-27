import type { CanvasSize } from '../../runtime/canvas.ts';
import { createSlider } from '../../runtime/controls.ts';
import type { Theme } from '../../runtime/palette.ts';
import { getScheduler, type Scheduler } from '../../runtime/scheduler.ts';
import { DEFAULT_PARAMS } from '../../sim/params.ts';
import { dividerChainHz } from '../../sim/quartz.ts';
import type { SimParams } from '../../sim/types.ts';
import { TAU } from '../../sim/units.ts';
import { labelFont } from '../shared/draw.ts';
import { formatCount } from '../shared/format.ts';
import { createShell } from '../shared/shell.ts';
import {
  advanceQuartz,
  forkDrawing,
  heightForWidth,
  initialQuartzState,
  levelsNow,
  maxSlowExponent,
  quartzLayout,
  readouts,
  rowCentreY,
  setSlowExponent,
  slowValueText,
  stageTrace,
  tickMarksX,
  windowStartText,
  type QuartzLayout,
  type QuartzState,
} from './logic.ts';

export interface Options {
  /** Injected by tests. Widgets on the page share the page's scheduler. */
  scheduler?: Scheduler;
  params?: SimParams;
}

/** A trace's high and low levels sit this far either side of its row's centre. */
const TRACE_HALF_HEIGHT_PX = 6;
/** Shaded traces, tick lines, and a blurred fork are drawn at this opacity. */
const FAINT_ALPHA = 0.3;

export function mount(el: HTMLElement, opts: Options = {}): () => void {
  const params = opts.params ?? DEFAULT_PARAMS;
  const chain = dividerChainHz(params);
  const referenceStage = params.referenceDividerStages;
  let state: QuartzState = initialQuartzState();

  const shell = createShell({
    el,
    scheduler: opts.scheduler ?? getScheduler(),
    className: 'widget-quartz',
    name: 'the quartz divider',
    canvasLabel:
      'A quartz crystal shaped like a tuning fork, and a logic analyser tracing the output of every stage of the divider chain over the last second: the crystal’s 32,768 Hz at the top, each row below it half the frequency of the row above, down to the 8 Hz reference at the bottom. Rows too fast to draw at the chosen speed are shaded.',
    heightForWidth: (w) => heightForWidth(w, params),
    advance: (dtS) => {
      state = advanceQuartz(state, dtS, params);
    },
    draw,
    readouts: () => readouts(state, params),
  });

  const slow = createSlider({
    label: 'Slow the crystal down',
    min: 0,
    max: maxSlowExponent(params),
    step: 1,
    initial: state.slowExponent,
    valueText: slowValueText,
    onInput: (exponent) => {
      // The count carries on from where it is; only its pace changes. The
      // window then shows the same moment at the new scale, because every
      // trace is a function of the count alone.
      state = setSlowExponent(state, exponent, params);
      shell.render();
    },
  });
  shell.controls.append(slow.element);

  function draw(ctx: CanvasRenderingContext2D, size: CanvasSize, t: Theme): void {
    const layout = quartzLayout(size.cssWidth, params);
    if (layout.traces.width <= 0) return;
    drawFork(ctx, layout, t);
    drawDiagram(ctx, layout, t);
  }

  function drawFork(ctx: CanvasRenderingContext2D, layout: QuartzLayout, t: Theme): void {
    const f = layout.fork;
    const fork = forkDrawing(state, params);
    const top = f.baseY - f.tineLength;
    const tine = (side: -1 | 1, spread: number) => {
      const x = f.cx + side * (f.gap / 2 + f.tineWidth / 2 + spread * f.swing);
      ctx.beginPath();
      ctx.moveTo(f.cx + side * (f.gap / 2 + f.tineWidth / 2), f.baseY);
      ctx.lineTo(x, top);
      ctx.stroke();
    };
    ctx.strokeStyle = t.parts.quartz;
    ctx.lineCap = 'round';
    ctx.lineWidth = f.tineWidth;
    if (fork.blurred) {
      // Too fast to follow: the tines smear across their whole swing.
      ctx.globalAlpha = FAINT_ALPHA;
      for (const spread of [-1, -0.5, 0, 0.5, 1]) {
        tine(-1, spread);
        tine(1, spread);
      }
      ctx.globalAlpha = 1;
    } else {
      tine(-1, fork.spread);
      tine(1, fork.spread);
    }
    // The bridge joining the tines, and the stem the crystal is mounted by.
    const bridge = f.gap + 2 * f.tineWidth;
    ctx.fillStyle = t.parts.quartz;
    ctx.fillRect(f.cx - bridge / 2, f.baseY - f.tineWidth / 2, bridge, f.tineWidth);
    ctx.fillRect(f.cx - f.tineWidth / 2, f.baseY, f.tineWidth, f.tineWidth * 1.5);
    ctx.lineCap = 'butt';

    const nameY = f.baseY + f.tineWidth * 1.5 + 4;
    ctx.textBaseline = 'top';
    if (layout.wide) {
      ctx.textAlign = 'center';
      ctx.fillStyle = t.parts.quartz;
      ctx.font = labelFont(13, 600);
      ctx.fillText('quartz crystal', f.cx, nameY);
      ctx.fillStyle = t.ui.muted;
      ctx.font = labelFont(12);
      ctx.fillText('swing exaggerated', f.cx, nameY + 18);
    } else {
      // Beside the fork, so the narrow layout spends no height on the name.
      const x = f.cx + bridge / 2 + f.swing + 14;
      ctx.textAlign = 'left';
      ctx.fillStyle = t.parts.quartz;
      ctx.font = labelFont(13, 600);
      ctx.fillText('quartz crystal', x, top + 6);
      ctx.fillStyle = t.ui.muted;
      ctx.font = labelFont(12);
      ctx.fillText('swing exaggerated', x, top + 24);
    }
  }

  function drawDiagram(ctx: CanvasRenderingContext2D, layout: QuartzLayout, t: Theme): void {
    const { x, width, top, rowPitch } = layout.traces;
    const bottom = top + rowPitch * chain.length;
    ctx.fillStyle = t.ui.background;
    ctx.fillRect(x, top, width, bottom - top);

    // Title, and a legend for the shading, on one line above the rows.
    const titleY = top - 6;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = t.parts.ic;
    ctx.font = labelFont(13, 600);
    ctx.fillText('Divider outputs', layout.diagramLeft, titleY);
    ctx.textAlign = 'right';
    ctx.fillStyle = t.ui.muted;
    ctx.font = labelFont(12);
    const legend = 'too fast to draw';
    const legendRight = x + width;
    ctx.fillText(legend, legendRight, titleY);
    const swatchRight = legendRight - ctx.measureText(legend).width - 6;
    ctx.globalAlpha = FAINT_ALPHA;
    ctx.fillStyle = t.parts.ic;
    ctx.fillRect(swatchRight - 16, titleY - 12, 16, 2 * TRACE_HALF_HEIGHT_PX);
    ctx.globalAlpha = 1;

    // Reference ticks: every divider falls at once as the counter rolls over.
    ctx.strokeStyle = t.parts.ic;
    ctx.globalAlpha = FAINT_ALPHA;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (const tx of tickMarksX(state, width, params)) {
      ctx.beginPath();
      ctx.moveTo(x + tx, top);
      ctx.lineTo(x + tx, bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const lamps = levelsNow(state, width, params);
    chain.forEach((hz, stage) => {
      const cy = rowCentreY(layout, stage);
      const colour = stage === 0 ? t.parts.quartz : t.parts.ic;
      const isReference = stage === referenceStage;

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colour;
      ctx.font = labelFont(12, isReference || stage === 0 ? 600 : 400);
      ctx.fillText(`${formatCount(hz)}\u202fHz`, layout.labelRight, cy);

      const trace = stageTrace(state, stage, width, params);
      const high = cy - TRACE_HALF_HEIGHT_PX;
      const low = cy + TRACE_HALF_HEIGHT_PX;
      if (trace.kind === 'shaded') {
        ctx.globalAlpha = FAINT_ALPHA;
        ctx.fillStyle = colour;
        ctx.fillRect(x, high, width, low - high);
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = colour;
        ctx.lineWidth = isReference ? 2.5 : 1.5;
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        trace.steps.forEach((s, i) => {
          const y = s.level ? high : low;
          if (i === 0) ctx.moveTo(x + s.x, y);
          else ctx.lineTo(x + s.x, y);
          const next = trace.steps[i + 1];
          ctx.lineTo(x + (next ? next.x : width), y);
        });
        ctx.stroke();
      }

      // The level now, as a lamp: filled high, open low, and a dash where the
      // trace is shaded, since a lamp there would only flicker.
      const lamp = lamps[stage];
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (lamp === null || lamp === undefined) {
        ctx.moveTo(layout.lampX - 4, cy);
        ctx.lineTo(layout.lampX + 4, cy);
        ctx.stroke();
      } else {
        ctx.arc(layout.lampX, cy, 4, 0, TAU);
        if (lamp) ctx.fill();
        else ctx.stroke();
      }
    });

    // The reference row's name, under its frequency, and the time axis.
    ctx.fillStyle = t.ui.muted;
    ctx.font = labelFont(12);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(windowStartText(state), x, bottom + 4);
    ctx.textAlign = 'right';
    ctx.fillText('now', x + width, bottom + 4);
    ctx.fillStyle = t.parts.ic;
    ctx.fillText('reference', layout.labelRight, bottom + 4);
  }

  return shell.destroy;
}
