import type { CanvasSize } from '../../runtime/canvas.ts';
import { createButton, createSlider, createToggle } from '../../runtime/controls.ts';
import type { Theme } from '../../runtime/palette.ts';
import { getScheduler, type Scheduler } from '../../runtime/scheduler.ts';
import { DEFAULT_PARAMS } from '../../sim/params.ts';
import { coastBrakeTorqueNm, coastFrictionTorqueNm } from '../../sim/spindown.ts';
import type { SimParams } from '../../sim/types.ts';
import { TAU, revSToRadS, wrapAngleRad } from '../../sim/units.ts';
import { polar } from '../shared/dial.ts';
import { drawCoil, drawMagnet, labelFont } from '../shared/draw.ts';
import { formatPercent, withUnit } from '../shared/format.ts';
import { createShell } from '../shared/shell.ts';
import {
  DUTY_STEP,
  advanceLenz,
  currentRun,
  dutyValueText,
  gridTicks,
  heightForWidth,
  initialLenzState,
  isStopped,
  lenzLayout,
  letGo,
  openCoilRun,
  plotPoint,
  plotSpeedMaxRevS,
  plotWindowS,
  readouts,
  rotorAngleRad,
  rotorOmegaRadS,
  runLabel,
  setDuty,
  setSlowMotion,
  placeLabels,
  openCoilLabelTimeS,
  TORQUE_ARC_START_RAD,
  torqueArcRad,
  type Box,
  type LenzLayout,
  type LenzState,
  type Run,
} from './logic.ts';

export interface Options {
  /** Injected by tests. Widgets on the page share the page's scheduler. */
  scheduler?: Scheduler;
  params?: SimParams;
}

/** Speed grid every 2 rev/s, time grid every quarter second, time labels every half. */
const SPEED_GRID_REV_S = 2;
const TIME_GRID_S = 0.25;
const TIME_LABEL_S = 0.5;

export function mount(el: HTMLElement, opts: Options = {}): () => void {
  const params = opts.params ?? DEFAULT_PARAMS;
  const openCoil = openCoilRun(params);
  const windowS = plotWindowS(openCoil);
  const speedMax = plotSpeedMaxRevS(params);
  let state: LenzState = initialLenzState();
  // Whether sim time is moving decides how letting go is shown (see letGo).
  let live = false;

  const shell = createShell({
    el,
    scheduler: opts.scheduler ?? getScheduler(),
    className: 'widget-lenz-brake',
    name: 'the coil brake',
    canvasLabel:
      'The glide wheel’s magnet under the coil, with arcs showing the brake and friction torques against its turning, and a plot of the wheel’s speed after it is let go from 8 rev/s. The more of the time the coil is shorted, the steeper the curve and the sooner the wheel stops.',
    heightForWidth,
    advance: (dtS) => {
      state = advanceLenz(state, dtS, params);
    },
    draw,
    readouts: () => readouts(state, params),
    onStatus: (status) => {
      live = status.ticking;
    },
  });

  const duty = createSlider({
    label: 'Coil shorted',
    min: 0,
    max: 1,
    step: DUTY_STEP,
    initial: state.duty,
    valueText: dutyValueText,
    onInput: (d) => {
      state = setDuty(state, d);
      shell.render();
    },
  });
  const release = createButton({
    label: 'Let go at 8 rev/s',
    ariaLabel: 'Let the glide wheel go from 8 rev/s',
    onPress: () => {
      state = letGo(state, live, params);
      shell.render();
    },
  });
  const slow = createToggle({
    label: 'Slow motion',
    ariaLabel: 'Slow motion for the coil brake, one eighth of real time',
    onChange: (on) => {
      state = setSlowMotion(state, on);
      shell.render();
    },
  });
  shell.controls.append(release, slow.element, duty.element);

  function draw(ctx: CanvasRenderingContext2D, size: CanvasSize, t: Theme): void {
    const layout = lenzLayout(size.cssWidth);
    if (layout.wheel.radius <= 0 || layout.plot.width <= 0) return;
    drawCoil(ctx, layout.coil, t);
    drawSwitchState(ctx, layout.coil, t);
    drawMagnet(
      ctx,
      layout.wheel,
      { angleRad: wrapAngleRad(rotorAngleRad(state)), sweepRad: state.sweepRad, polePairs: params.generatorPolePairs },
      t,
    );
    drawTorqueArcs(ctx, layout, t);
    drawPlot(ctx, layout.plot, t);
  }

  function drawSwitchState(ctx: CanvasRenderingContext2D, c: Box, t: Theme) {
    ctx.fillStyle = t.parts.coil;
    ctx.font = labelFont(12);
    // Left of the coil, since its name is on the right and the torque arcs
    // come up the wheel's right side.
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const text = state.duty > 0 ? `shorted ${formatPercent(state.duty, 0)}` : 'open';
    ctx.fillText(text, c.x - 6, c.y + c.height / 2);
  }

  function arc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sweep: number, colour: string) {
    // Anticlockwise, against the wheel, which turns clockwise. Dial angles
    // run clockwise from 12; the canvas's arc runs from 3.
    if (sweep <= 0) return;
    const from = TORQUE_ARC_START_RAD;
    const to = from - sweep;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 3;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(cx, cy, r, from - Math.PI / 2, to - Math.PI / 2, true);
    ctx.stroke();
    // An arrowhead at the far end, pointing along the arc.
    const tip = polar(cx, cy, r, to);
    const back = polar(cx, cy, r, to + Math.min(0.35, sweep));
    const dx = tip.x - back.x;
    const dy = tip.y - back.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const head = 7;
    ctx.beginPath();
    ctx.moveTo(tip.x + ux * 2, tip.y + uy * 2);
    ctx.lineTo(tip.x - ux * head - uy * head * 0.6, tip.y - uy * head + ux * head * 0.6);
    ctx.lineTo(tip.x - ux * head + uy * head * 0.6, tip.y - uy * head - ux * head * 0.6);
    ctx.closePath();
    ctx.fill();
  }

  function drawTorqueArcs(ctx: CanvasRenderingContext2D, layout: LenzLayout, t: Theme) {
    const { cx, cy } = layout.wheel;
    const omega = rotorOmegaRadS(state, params);
    arc(
      ctx,
      cx,
      cy,
      layout.brakeArcRadius,
      torqueArcRad(coastBrakeTorqueNm(omega, state.duty, params), params),
      t.parts.coil,
    );
    arc(ctx, cx, cy, layout.frictionArcRadius, torqueArcRad(coastFrictionTorqueNm(omega, params), params), t.ui.muted);

    // A key to the arcs, centred under the wheel's name.
    ctx.font = labelFont(12);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const items = [
      { text: 'brake torque', colour: t.parts.coil },
      { text: 'friction', colour: t.ui.muted },
    ];
    const swatch = 14;
    const gap = 12;
    const widths = items.map((i) => swatch + 4 + ctx.measureText(i.text).width);
    let x = cx - (widths.reduce((a, b) => a + b, 0) + gap) / 2;
    items.forEach((item, i) => {
      ctx.strokeStyle = item.colour;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, layout.legendY);
      ctx.lineTo(x + swatch, layout.legendY);
      ctx.stroke();
      ctx.fillStyle = item.colour;
      ctx.fillText(item.text, x + swatch + 4, layout.legendY);
      x += (widths[i] ?? 0) + gap;
    });
  }

  function traceRun(ctx: CanvasRenderingContext2D, box: Box, run: Run) {
    ctx.beginPath();
    run.points.forEach((p, i) => {
      const q = plotPoint(box, p.timeS, p.omegaRadS, windowS, speedMax);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
  }

  function drawPlot(ctx: CanvasRenderingContext2D, box: Box, t: Theme) {
    ctx.fillStyle = t.ui.background;
    ctx.fillRect(box.x, box.y, box.width, box.height);

    // Grid and axis labels.
    ctx.lineWidth = 1;
    ctx.font = labelFont(12);
    ctx.fillStyle = t.ui.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of gridTicks(speedMax, SPEED_GRID_REV_S)) {
      const y = plotPoint(box, 0, revSToRadS(v), windowS, speedMax).y;
      ctx.strokeStyle = v === 0 ? t.ui.muted : t.ui.grid;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.width, y);
      ctx.stroke();
      ctx.fillText(String(v), box.x - 4, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const s of gridTicks(windowS, TIME_GRID_S)) {
      const x = plotPoint(box, s, 0, windowS, speedMax).x;
      ctx.strokeStyle = t.ui.grid;
      ctx.beginPath();
      ctx.moveTo(x, box.y);
      ctx.lineTo(x, box.y + box.height);
      ctx.stroke();
      if (Math.abs(s / TIME_LABEL_S - Math.round(s / TIME_LABEL_S)) < 1e-9) {
        ctx.textAlign = s === 0 ? 'left' : x > box.x + box.width - 20 ? 'right' : 'center';
        ctx.fillText(withUnit(s, 1, 's'), x, box.y + box.height + 4);
      }
    }

    ctx.fillStyle = t.parts.rotor;
    ctx.font = labelFont(13, 600);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Speed after letting go, rev/s', box.x - 24, box.y - 5);

    // The open coil, dashed, then earlier runs faint, then this run.
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = t.ui.muted;
    ctx.setLineDash([5, 4]);
    traceRun(ctx, box, openCoil);
    ctx.setLineDash([]);
    ctx.strokeStyle = t.parts.coil;
    ctx.globalAlpha = 0.4;
    for (const run of state.history) traceRun(ctx, box, run);
    ctx.globalAlpha = 1;
    const run = currentRun(state);
    if (run) {
      ctx.lineWidth = 2.5;
      traceRun(ctx, box, run);
      const last = run.points.at(-1);
      if (last && !isStopped(state)) {
        const now = plotPoint(box, last.timeS, last.omegaRadS, windowS, speedMax);
        ctx.fillStyle = t.parts.coil;
        ctx.beginPath();
        ctx.arc(now.x, now.y, 4, 0, TAU);
        ctx.fill();
      }
    }

    // The open coil's name above its curve, where nothing else is drawn.
    ctx.font = labelFont(12);
    ctx.fillStyle = t.ui.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const labelS = openCoilLabelTimeS(windowS);
    const onCurve = openCoil.points.find((p) => p.timeS >= labelS) ?? openCoil.points[0];
    if (onCurve) {
      const at = plotPoint(box, onCurve.timeS, onCurve.omegaRadS, windowS, speedMax);
      ctx.fillText(runLabel(openCoil), at.x + 4, at.y - 4);
    }

    // Each finished run's name beside where it stopped: this run's first,
    // then earlier runs, newest first, where they fit. A run with the coil
    // open throughout is the reference curve again, already named.
    const named = [
      ...(run ? [{ run, alpha: 1 }] : []),
      ...[...state.history].reverse().map((r) => ({ run: r, alpha: 0.7 })),
    ].filter((f) => f.run.stopS !== null && runLabel(f.run) !== runLabel(openCoil));
    const spans = placeLabels(
      named.map((f) => ({
        x: plotPoint(box, f.run.stopS ?? 0, 0, windowS, speedMax).x,
        width: ctx.measureText(runLabel(f.run)).width,
      })),
      box.x,
      box.x + box.width,
    );
    ctx.fillStyle = t.parts.coil;
    named.forEach((f, i) => {
      const span = spans[i];
      if (!span) return;
      ctx.globalAlpha = f.alpha;
      ctx.fillText(runLabel(f.run), span.from, box.y + box.height - 3);
    });
    ctx.globalAlpha = 1;
  }

  return shell.destroy;
}
