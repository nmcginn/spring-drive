import type { CanvasSize } from '../../runtime/canvas.ts';
import { createButton, createSlider } from '../../runtime/controls.ts';
import type { Theme } from '../../runtime/palette.ts';
import { getScheduler, type Scheduler } from '../../runtime/scheduler.ts';
import { DEFAULT_PARAMS, POWER_RESERVE_H } from '../../sim/params.ts';
import type { SimParams } from '../../sim/types.ts';
import { handAngles } from '../shared/dial.ts';
import { drawArbor, drawDialFace, drawHand, labelFont } from '../shared/draw.ts';
import { formatDuration, withUnit } from '../shared/format.ts';
import { colours } from '../shared/colours.ts';
import { createShell } from '../shared/shell.ts';
import {
  CHART_SPAN_S,
  INITIAL_RATE_INDEX,
  RATES,
  EVENT_LINE_PX,
  advanceTri,
  channelValue,
  chartChannels,
  chartPoint,
  chartX,
  eventLabel,
  eventRole,
  flows,
  formatPower,
  formatShare,
  handsAheadS,
  heightForWidth,
  initialTriState,
  powerShares,
  rateNote,
  rateValueText,
  readouts,
  reserveFraction,
  setRateIndex,
  showsSecondsHand,
  skip,
  statusLine,
  statusRole,
  stripY,
  timeLabels,
  triLayout,
  wind,
  type Box,
  type TriLayout,
  type TriState,
} from './logic.ts';

export interface Options {
  /** Injected by tests. Widgets on the page share the page's scheduler. */
  scheduler?: Scheduler;
  params?: SimParams;
}

export function mount(el: HTMLElement, opts: Options = {}): () => void {
  const params = opts.params ?? DEFAULT_PARAMS;
  let state: TriState = initialTriState(params);

  const shell = createShell({
    el,
    scheduler: opts.scheduler ?? getScheduler(),
    className: 'widget-tri-synchro',
    name: 'the whole movement over its reserve',
    canvasLabel:
      'A watch dial whose hands are geared to the glide wheel, with faint hands showing true time, beside bars showing where the power reaching the glide wheel goes: friction, the brake, and the electricity that runs the IC. Below, the power reserve, and a chart over the whole reserve of the wheel’s speed, the supply voltage, and the brake duty, with the moments regulation ends, the IC browns out, and the wheel stops.',
    heightForWidth,
    advance: (dtS) => {
      state = advanceTri(state, dtS, params);
    },
    draw,
    readouts: () => readouts(state, params),
  });

  const note = document.createElement('p');
  note.className = 'widget-note';
  note.textContent = rateNote();
  shell.root.append(note);

  const rateSlider = createSlider({
    label: 'Time runs at',
    ariaLabel: 'Time runs at: how fast the whole reserve plays',
    min: 0,
    max: RATES.length - 1,
    step: 1,
    initial: INITIAL_RATE_INDEX,
    valueText: (i) => rateValueText(RATES[i] ?? RATES[INITIAL_RATE_INDEX]),
    onInput: (i) => {
      state = setRateIndex(state, i);
      shell.render();
    },
  });
  const windButton = createButton({
    label: 'Wind',
    ariaLabel: 'Wind the mainspring fully and start the reserve again from 0 h',
    onPress: () => {
      state = wind(state, params);
      shell.render();
    },
  });
  const skipButton = createButton({
    label: 'Skip 6 h',
    ariaLabel: 'Skip 6 h: six hours ahead',
    onPress: () => {
      state = skip(state, params);
      shell.render();
    },
  });
  shell.controls.append(windButton, skipButton, rateSlider.element);

  function draw(ctx: CanvasRenderingContext2D, size: CanvasSize, t: Theme): void {
    const layout = triLayout(size.cssWidth);
    if (layout.dial.radius <= 0 || (layout.strips[0]?.width ?? 0) <= 0) return;
    drawDial(ctx, layout, t);
    drawPanel(ctx, layout, t);
    drawReserve(ctx, layout.reserve, t);
    drawChart(ctx, layout, t);
  }

  function drawDial(ctx: CanvasRenderingContext2D, layout: TriLayout, t: Theme) {
    const { cx, cy, radius } = layout.dial;
    drawDialFace(ctx, cx, cy, radius, t);
    const truth = handAngles(state.sim.timeS);
    const watch = handAngles(state.sim.timeS + handsAheadS(state, params));
    const seconds = showsSecondsHand(state);
    const ghost = t.ui.grid;
    const c = colours(t);
    drawHand(ctx, cx, cy, radius, truth.hourRad, { colour: ghost, widthPx: 4, length: 0.5 });
    drawHand(ctx, cx, cy, radius, truth.minuteRad, { colour: ghost, widthPx: 3, length: 0.78 });
    if (seconds) drawHand(ctx, cx, cy, radius, truth.secondRad, { colour: ghost, widthPx: 1.5, length: 0.92 });
    drawHand(ctx, cx, cy, radius, watch.hourRad, { colour: c.hands, widthPx: 4, length: 0.5, tail: 0.1 });
    drawHand(ctx, cx, cy, radius, watch.minuteRad, { colour: c.hands, widthPx: 3, length: 0.78, tail: 0.1 });
    if (seconds) {
      drawHand(ctx, cx, cy, radius, watch.secondRad, { colour: c.hands, widthPx: 1.5, length: 0.92, tail: 0.18 });
    }
    drawArbor(ctx, cx, cy, 3, c.hands);

    ctx.font = labelFont(13, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c[statusRole(state)];
    ctx.fillText(statusLine(state), cx, layout.statusY);
  }

  function drawPanel(ctx: CanvasRenderingContext2D, layout: TriLayout, t: Theme) {
    const { panel } = layout;
    const f = flows(state, params);
    const c = colours(t);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = c.glideWheel;
    ctx.font = labelFont(13, 600);
    ctx.fillText('Glide wheel power', panel.x, panel.y);
    ctx.fillStyle = t.ui.text;
    ctx.font = labelFont(13);
    ctx.fillText(f.driveW > 0 ? `${formatPower(f.driveW)} from the spring` : 'none', panel.x, panel.y + 18);

    powerShares(f).forEach((share, i) => {
      const bar = panel.bars[i];
      if (!bar) return;
      const colour = share.role ? c[share.role] : t.ui.muted;
      ctx.fillStyle = colour;
      ctx.font = labelFont(12, 600);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(share.label, bar.x, bar.y - 3);
      ctx.fillStyle = t.ui.text;
      ctx.font = labelFont(12);
      ctx.textAlign = 'right';
      ctx.fillText(formatShare(share.share), bar.x + bar.width, bar.y - 3);
      ctx.fillStyle = t.ui.grid;
      ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
      ctx.fillStyle = colour;
      // A share too small to see still gets a sliver, so "1.8 %" has a bar.
      const w = share.share > 0 ? Math.max(2, bar.width * share.share) : 0;
      ctx.fillRect(bar.x, bar.y, w, bar.height);
    });
  }

  function drawReserve(ctx: CanvasRenderingContext2D, bar: Box, t: Theme) {
    const spring = colours(t).mainspring;
    ctx.fillStyle = spring;
    ctx.font = labelFont(13, 600);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Power reserve', bar.x, bar.y - 5);
    ctx.fillStyle = t.ui.grid;
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
    ctx.fillStyle = spring;
    ctx.fillRect(bar.x, bar.y, bar.width * reserveFraction(state, params), bar.height);
    ctx.fillStyle = t.ui.muted;
    ctx.font = labelFont(12);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('0 h', bar.x, bar.y + bar.height + 4);
    ctx.textAlign = 'right';
    ctx.fillText(withUnit(POWER_RESERVE_H, 0, 'h'), bar.x + bar.width, bar.y + bar.height + 4);
  }

  function drawChart(ctx: CanvasRenderingContext2D, layout: TriLayout, t: Theme) {
    const c = colours(t);
    const traceColours = { speed: c.speed, supply: c.supply, duty: c.brake } as const;
    // 8 rev/s is what the reference asks of the wheel; the brownout is the IC's.
    const markColours = { speed: c.reference, supply: c.ic, duty: t.ui.grid } as const;
    const now = Math.min(state.sim.timeS, CHART_SPAN_S);
    chartChannels(params).forEach((ch, i) => {
      const box = layout.strips[i];
      if (!box) return;
      ctx.fillStyle = t.ui.background;
      ctx.fillRect(box.x, box.y, box.width, box.height);

      ctx.lineWidth = 1;
      ctx.font = labelFont(11);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of ch.grid) {
        const y = stripY(box, v, ch.min, ch.max);
        ctx.strokeStyle = t.ui.grid;
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(box.x + box.width, y);
        ctx.stroke();
        ctx.fillStyle = t.ui.muted;
        ctx.fillText(String(v), box.x - 4, y);
      }
      if (ch.mark !== null) {
        // The target speed, and the IC's brownout, dashed in their parts' colours.
        const y = stripY(box, ch.mark, ch.min, ch.max);
        ctx.strokeStyle = markColours[ch.channel];
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(box.x + box.width, y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!ch.grid.includes(ch.mark)) {
          ctx.fillStyle = markColours[ch.channel];
          ctx.fillText(String(ch.mark), box.x - 4, y);
        }
      }

      ctx.fillStyle = traceColours[ch.channel];
      ctx.font = labelFont(12, 600);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(ch.title, box.x - 30, box.y - 10);

      // The trace so far, as one path, and the present as its last point.
      ctx.strokeStyle = traceColours[ch.channel];
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      state.history.forEach((p, k) => {
        const x = chartX(box, p.timeS);
        const y = stripY(box, channelValue(p, ch.channel), ch.min, ch.max);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (state.sim.timeS <= CHART_SPAN_S) {
        const last = chartPoint(state.sim);
        ctx.lineTo(chartX(box, now), stripY(box, channelValue(last, ch.channel), ch.min, ch.max));
      }
      ctx.stroke();
    });

    const top = layout.strips[0];
    const bottom = layout.strips.at(-1);
    if (!top || !bottom) return;

    // Now, and the events so far, as vertical lines through each strip, but
    // not the title rows between them, where they would strike the titles through.
    const vertical = (timeS: number) => {
      for (const box of layout.strips) {
        const x = chartX(box, timeS);
        ctx.beginPath();
        ctx.moveTo(x, box.y);
        ctx.lineTo(x, box.y + box.height);
        ctx.stroke();
      }
    };
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.ui.muted;
    ctx.setLineDash([2, 3]);
    for (const e of state.events) vertical(e.timeS);
    ctx.setLineDash([]);
    ctx.strokeStyle = t.ui.text;
    vertical(now);

    ctx.fillStyle = t.ui.muted;
    ctx.font = labelFont(11);
    ctx.textBaseline = 'top';
    for (const l of timeLabels()) {
      const x = chartX(bottom, l.timeS);
      ctx.textAlign = l.timeS === 0 ? 'left' : 'center';
      ctx.fillText(l.text, x, bottom.y + bottom.height + 4);
    }

    // The events, named under the chart, where they cannot crowd each other:
    // at the chart's scale the last three hours are a few pixels wide.
    ctx.font = labelFont(12);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    state.events.slice(0, 3).forEach((e, i) => {
      const y = layout.eventsY + i * EVENT_LINE_PX;
      const role = eventRole(e.kind);
      ctx.fillStyle = role ? c[role] : t.ui.text;
      ctx.fillText(`${eventLabel(e.kind)} at ${formatDuration(e.timeS)}`, top.x - 30, y);
    });
    if (state.events.length === 0) {
      ctx.fillStyle = t.ui.muted;
      ctx.fillText('Dashed lines will mark where regulation ends,', top.x - 30, layout.eventsY);
      ctx.fillText('the IC browns out, and the glide wheel stops.', top.x - 30, layout.eventsY + EVENT_LINE_PX);
    }
  }

  return shell.destroy;
}
