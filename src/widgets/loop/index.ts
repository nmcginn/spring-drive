import type { CanvasSize } from '../../runtime/canvas.ts';
import { createButton, createToggle } from '../../runtime/controls.ts';
import type { Theme } from '../../runtime/palette.ts';
import { getScheduler, type Scheduler } from '../../runtime/scheduler.ts';
import { phaseErrorRad } from '../../sim/detailed.ts';
import { DEFAULT_PARAMS } from '../../sim/params.ts';
import type { SimParams } from '../../sim/types.ts';
import { wrapAngleRad } from '../../sim/units.ts';
import { polar } from '../shared/dial.ts';
import { drawCoil, drawMagnet, labelFont } from '../shared/draw.ts';
import { formatPercent } from '../shared/format.ts';
import { placeLabels } from '../shared/labels.ts';
import { colours } from '../shared/colours.ts';
import { createShell } from '../shared/shell.ts';
import {
  advanceLoop,
  channelValue,
  currentDuty,
  eventLabel,
  heightForWidth,
  initialLoopState,
  knock,
  loopLayout,
  readouts,
  scopeChannels,
  scopeX,
  setRegulation,
  status,
  stripY,
  timeLabels,
  traceRuns,
  type Box,
  type LoopLayout,
  type LoopState,
} from './logic.ts';

export interface Options {
  /** Injected by tests. Widgets on the page share the page's scheduler. */
  scheduler?: Scheduler;
  params?: SimParams;
}

/** Event marks reach a little above the top strip, into its title row, to meet their names. */
const EVENT_TICK_PX = 6;

export function mount(el: HTMLElement, opts: Options = {}): () => void {
  const params = opts.params ?? DEFAULT_PARAMS;
  let state: LoopState = initialLoopState(params);
  // Whether sim time is moving decides how an action is shown (see respond in logic.ts).
  let live = false;

  const shell = createShell({
    el,
    scheduler: opts.scheduler ?? getScheduler(),
    className: 'widget-loop',
    name: 'the regulating loop',
    canvasLabel:
      'The glide wheel as the reference sees it, under the coil: turned from 12 o’clock by the phase error, so it stands still while locked and swings away when knocked. Beside it, a scope traces the last eight seconds of the wheel’s speed, the phase error, and the share of the time the coil is shorted.',
    heightForWidth,
    advance: (dtS) => {
      state = advanceLoop(state, dtS, params);
    },
    draw,
    readouts: () => readouts(state, params),
    onStatus: (s) => {
      live = s.ticking;
    },
  });

  const faster = createButton({
    label: 'Knock +2 rev/s',
    ariaLabel: 'Knock +2 rev/s: a knock that speeds the glide wheel up by 2 rev/s',
    onPress: () => {
      state = knock(state, 1, live, params);
      shell.render();
    },
  });
  const slower = createButton({
    label: 'Knock −2 rev/s',
    ariaLabel: 'Knock −2 rev/s: a knock that slows the glide wheel down by 2 rev/s',
    onPress: () => {
      state = knock(state, -1, live, params);
      shell.render();
    },
  });
  const regulation = createToggle({
    label: 'Regulation',
    ariaLabel: 'Regulation: the IC brakes the glide wheel to hold it on the reference',
    initial: true,
    onChange: (on) => {
      state = setRegulation(state, on, live, params);
      shell.render();
    },
  });
  shell.controls.append(faster, slower, regulation.element);

  function draw(ctx: CanvasRenderingContext2D, size: CanvasSize, t: Theme): void {
    const layout = loopLayout(size.cssWidth);
    if (layout.wheel.radius <= 0 || (layout.strips[0]?.width ?? 0) <= 0) return;
    drawCoil(ctx, layout.coil, t);
    drawSwitchState(ctx, layout.coil, t);
    drawMagnet(
      ctx,
      layout.wheel,
      {
        angleRad: wrapAngleRad(phaseErrorRad(state.sim, params)),
        sweepRad: state.sweepRad,
        polePairs: params.generatorPolePairs,
      },
      t,
    );
    drawReferenceMark(ctx, layout, t);
    drawCaption(ctx, layout, t);
    drawScope(ctx, layout, t);
  }

  function drawSwitchState(ctx: CanvasRenderingContext2D, c: Box, t: Theme) {
    ctx.fillStyle = colours(t).coil;
    ctx.font = labelFont(12);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const duty = currentDuty(state);
    ctx.fillText(duty > 0 ? `shorted ${formatPercent(duty, 0)}` : 'open', c.x - 6, c.y + c.height / 2);
  }

  /** A pointer in the reference's colour at 12 o'clock: where the north pole should be at every reference tick. */
  function drawReferenceMark(ctx: CanvasRenderingContext2D, layout: LoopLayout, t: Theme) {
    const { cx, cy, radius } = layout.wheel;
    const tip = polar(cx, cy, radius + 1, 0);
    const size = Math.max(6, radius * 0.14);
    ctx.fillStyle = colours(t).reference;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - size * 0.6, tip.y - size);
    ctx.lineTo(tip.x + size * 0.6, tip.y - size);
    ctx.closePath();
    ctx.fill();
  }

  function drawCaption(ctx: CanvasRenderingContext2D, layout: LoopLayout, t: Theme) {
    const { cx, cy, radius } = layout.wheel;
    // drawMagnet names the wheel just under it; this says how it is seen.
    ctx.font = labelFont(12);
    ctx.fillStyle = t.ui.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('as the reference sees it', cx, cy + radius + 21);

    const s = status(state);
    ctx.font = labelFont(13, 600);
    ctx.textBaseline = 'middle';
    // The IC's colour whatever its state, since the line names it; the words
    // say whether it is locked, for every reader.
    ctx.fillStyle = colours(t).ic;
    ctx.fillText(s === 'locked' ? 'IC: locked' : `IC: ${s}`, cx, layout.statusY);
  }

  function drawScope(ctx: CanvasRenderingContext2D, layout: LoopLayout, t: Theme) {
    const now = state.sim.timeS;
    let titleEnd = 0;
    const c = colours(t);
    const traceColours = { speed: c.speed, phase: c.ic, duty: c.brake } as const;
    scopeChannels(params).forEach((ch, i) => {
      const box = layout.strips[i];
      if (!box) return;
      ctx.fillStyle = t.ui.background;
      ctx.fillRect(box.x, box.y, box.width, box.height);

      // Grid, and the value the loop aims for in the reference's colour: 8 rev/s, and zero phase error.
      ctx.lineWidth = 1;
      ctx.font = labelFont(11);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of ch.grid) {
        const { y } = stripY(box, v, ch.min, ch.max);
        const target = v === ch.target;
        ctx.strokeStyle = target ? c.reference : t.ui.grid;
        ctx.setLineDash(target ? [4, 3] : []);
        ctx.beginPath();
        ctx.moveTo(box.x, y);
        ctx.lineTo(box.x + box.width, y);
        ctx.stroke();
        ctx.fillStyle = t.ui.muted;
        ctx.fillText(v > 0 && ch.channel === 'phase' ? `+${v}` : String(v).replace('-', '−'), box.x - 4, y);
      }
      ctx.setLineDash([]);

      ctx.fillStyle = traceColours[ch.channel];
      ctx.font = labelFont(12, 600);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(ch.title, box.x - 30, box.y - 9);
      if (i === 0) titleEnd = box.x - 30 + ctx.measureText(ch.title).width;

      // The trace. Off the scale, it is pinned to the edge and drawn thin and faint.
      ctx.strokeStyle = traceColours[ch.channel];
      ctx.lineJoin = 'round';
      const traced = state.history.map((p) => ({
        x: scopeX(box, p.timeS, now),
        ...stripY(box, channelValue(p, ch.channel), ch.min, ch.max),
      }));
      for (const run of traceRuns(traced)) {
        ctx.lineWidth = run.faint ? 1 : 2;
        ctx.globalAlpha = run.faint ? 0.5 : 1;
        ctx.beginPath();
        run.points.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
      const prev = traced.at(-1);
      ctx.globalAlpha = 1;
      if (prev?.clipped) {
        ctx.fillStyle = traceColours[ch.channel];
        ctx.font = labelFont(11);
        ctx.textAlign = 'right';
        ctx.textBaseline = prev.y <= box.y + 1 ? 'top' : 'bottom';
        ctx.fillText('off scale', box.x + box.width - 3, prev.y <= box.y + 1 ? box.y + 2 : box.y + box.height - 2);
      }
    });

    // What the reader did, as vertical marks through every strip, named in
    // the top strip's title row, clear of the title and of each other: the
    // newest first, and an older one gives way. Inside the strip a name
    // would sit on a trace pinned off scale.
    const top = layout.strips[0];
    const bottom = layout.strips.at(-1);
    if (!top || !bottom) return;
    ctx.strokeStyle = t.ui.muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (const e of state.events) {
      const x = scopeX(top, e.timeS, now);
      ctx.beginPath();
      ctx.moveTo(x, top.y - EVENT_TICK_PX);
      ctx.lineTo(x, bottom.y + bottom.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = labelFont(11);
    const newest = [...state.events].reverse();
    const spans = placeLabels(
      newest.map((e) => ({ x: scopeX(top, e.timeS, now), width: ctx.measureText(eventLabel(e)).width })),
      titleEnd,
      top.x + top.width,
    );
    ctx.fillStyle = t.ui.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    newest.forEach((e, i) => {
      const span = spans[i];
      if (span) ctx.fillText(eventLabel(e), span.from, top.y - 9);
    });

    ctx.fillStyle = t.ui.muted;
    ctx.textBaseline = 'top';
    for (const l of timeLabels()) {
      const x = scopeX(bottom, now - l.agoS, now);
      ctx.textAlign = l.agoS === 0 ? 'right' : x <= bottom.x + 1 ? 'left' : 'center';
      ctx.fillText(l.text, x, bottom.y + bottom.height + 4);
    }
  }

  return shell.destroy;
}
