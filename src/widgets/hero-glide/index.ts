import { createToggle } from '../../runtime/controls.ts';
import type { Theme } from '../../runtime/palette.ts';
import { getScheduler, type Scheduler } from '../../runtime/scheduler.ts';
import { DEFAULT_PARAMS } from '../../sim/params.ts';
import type { SimParams } from '../../sim/types.ts';
import { TAU } from '../../sim/units.ts';
import { handAngles, polar } from '../shared/dial.ts';
import { drawArbor, drawDialFace, drawHand, labelFont } from '../shared/draw.ts';
import { createShell } from '../shared/shell.ts';
import {
  LOUPE_MAGNIFICATION,
  TIP_RADIUS,
  advanceHero,
  elapsedS,
  heightForWidth,
  heroLayout,
  initialHeroState,
  loupeHalfWindowRad,
  loupeMarks,
  loupePoint,
  mechanicalShownS,
  readouts,
  setSlowMotion,
  springDriveShownS,
  type DialLayout,
  type HeroState,
} from './logic.ts';

export interface Options {
  /** Injected by tests. Widgets on the page share the page's scheduler. */
  scheduler?: Scheduler;
  params?: SimParams;
}

const SECONDS_HAND = { widthPx: 1.5, length: 0.95, tail: 0.18 };

export function mount(el: HTMLElement, opts: Options = {}): () => void {
  const params = opts.params ?? DEFAULT_PARAMS;
  let state: HeroState = initialHeroState(params);

  const shell = createShell({
    el,
    scheduler: opts.scheduler ?? getScheduler(),
    className: 'widget-hero-glide',
    name: 'the two watches',
    canvasLabel:
      'Two watch dials side by side. The Spring Drive seconds hand glides continuously; the mechanical one steps eight times a second. A magnifier under each dial follows the tip of its seconds hand: the Spring Drive’s scale glides past it, the mechanical watch’s jumps.',
    heightForWidth,
    advance: (dtS) => {
      state = advanceHero(state, dtS, params);
    },
    draw,
    readouts: () => readouts(state),
  });

  const slowMotion = createToggle({
    label: 'Slow motion',
    ariaLabel: 'Slow motion, one eighth of real time',
    onChange: (on) => {
      state = setSlowMotion(state, on);
      shell.render();
    },
  });
  shell.controls.append(slowMotion.element);

  function draw(ctx: CanvasRenderingContext2D, size: { cssWidth: number }, t: Theme): void {
    const layout = heroLayout(size.cssWidth);
    drawWatch(ctx, layout.springDrive, springDriveShownS(state, params), 'Spring Drive', t);
    drawWatch(ctx, layout.mechanical, mechanicalShownS(elapsedS(state)), 'Mechanical', t);
  }

  function drawWatch(ctx: CanvasRenderingContext2D, d: DialLayout, shownS: number, caption: string, t: Theme): void {
    if (d.radius <= 0) return;
    const hands = handAngles(shownS);
    drawDialFace(ctx, d.cx, d.cy, d.radius, t);
    drawHand(ctx, d.cx, d.cy, d.radius, hands.hourRad, { colour: t.parts.hand, widthPx: 4, length: 0.5, tail: 0.1 });
    drawHand(ctx, d.cx, d.cy, d.radius, hands.minuteRad, { colour: t.parts.hand, widthPx: 3, length: 0.78, tail: 0.1 });
    drawHand(ctx, d.cx, d.cy, d.radius, hands.secondRad, { ...SECONDS_HAND, colour: t.parts.rotor });
    drawArbor(ctx, d.cx, d.cy, 3, t.parts.rotor);

    // Each loupe follows its own seconds hand, so the hand stays at its
    // centre and the dial's scale moves past it: smoothly under the Spring
    // Drive, in 0.75° jumps under the mechanical watch. A ring on the dial
    // shows where it is looking.
    const tipPx = d.radius * TIP_RADIUS;
    const k = LOUPE_MAGNIFICATION;
    const spot = polar(d.cx, d.cy, tipPx, hands.secondRad);
    ctx.strokeStyle = t.ui.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, d.loupe.radius / k, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = t.ui.text;
    ctx.font = labelFont(14, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(caption, d.cx, d.labelY);

    drawLoupe(ctx, d, hands.secondRad, t);
  }

  function drawLoupe(ctx: CanvasRenderingContext2D, d: DialLayout, centreRad: number, t: Theme): void {
    const { loupe } = d;
    const k = LOUPE_MAGNIFICATION;
    const tipPx = d.radius * TIP_RADIUS;
    const centre = { x: loupe.cx, y: loupe.cy };
    const at = (rhoPx: number, angleRad: number) => loupePoint(rhoPx, angleRad, centreRad, tipPx, k, centre);

    ctx.save();
    ctx.beginPath();
    ctx.arc(loupe.cx, loupe.cy, loupe.radius, 0, TAU);
    ctx.fillStyle = t.ui.background;
    ctx.fill();
    ctx.clip();

    ctx.strokeStyle = t.ui.muted;
    for (const mark of loupeMarks(centreRad, loupeHalfWindowRad(loupe.radius, tipPx, k))) {
      const inner = at(d.radius * (mark.second ? 0.9 : 0.935), mark.angleRad);
      const outer = at(d.radius * 0.96, mark.angleRad);
      ctx.lineWidth = mark.second ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
    }

    const base = at(tipPx - (2 * loupe.radius) / k, centreRad);
    const tip = at(d.radius * SECONDS_HAND.length, centreRad);
    ctx.strokeStyle = t.parts.rotor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = t.ui.grid;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(loupe.cx, loupe.cy, loupe.radius, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = t.ui.muted;
    ctx.font = labelFont(12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`×${k}`, loupe.cx, loupe.cy + loupe.radius + 4);
  }

  return shell.destroy;
}
