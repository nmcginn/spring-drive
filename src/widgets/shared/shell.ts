// The parts every widget has, assembled once: a HiDPI canvas, a list of
// readouts, a row of controls with the reduced-motion Play button first, and
// the scheduler registration that drives it all. A widget supplies its state
// transitions and its drawing; the shell makes sure it ticks only when the
// scheduler says so, redraws on resize and on a colour-scheme change, and
// releases every listener on unmount.

import { createHiDpiCanvas, type CanvasSize } from '../../runtime/canvas.ts';
import { createMotionButton } from '../../runtime/controls.ts';
import { onSchemeChange, theme, type Theme } from '../../runtime/palette.ts';
import type { Handle, Scheduler, WidgetStatus } from '../../runtime/scheduler.ts';

export interface Readout {
  label: string;
  value: string;
}

export interface ShellOptions {
  el: HTMLElement;
  scheduler: Scheduler;
  /** Class on the widget's root, `widget-<id>`. Tests find the widget by it. */
  className: string;
  /** Names the widget in its Play button: "Play <name>". */
  name: string;
  /** What the canvas shows, for screen readers. */
  canvasLabel: string;
  heightForWidth: (cssWidth: number) => number;
  /** Advance the widget's state by `dtS` of page time. Called only while ticking. */
  advance: (dtS: number) => void;
  draw: (ctx: CanvasRenderingContext2D, size: CanvasSize, t: Theme) => void;
  readouts: () => readonly Readout[];
  onStatus?: (status: WidgetStatus) => void;
}

export interface Shell {
  root: HTMLElement;
  /** Where the widget adds its own controls, after the Play button. */
  controls: HTMLElement;
  /** Redraw and refresh the readouts, after a control changed the state. */
  render: () => void;
  destroy: () => void;
}

export function createShell(opts: ShellOptions): Shell {
  let handle: Handle | undefined;
  let ticks = 0;

  const root = document.createElement('div');
  root.className = `widget ${opts.className}`;
  root.dataset.ticks = '0';

  const readoutList = document.createElement('dl');
  readoutList.className = 'readouts';
  const valueCells = opts.readouts().map(({ label }) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    readoutList.append(dt, dd);
    return dd;
  });

  const controls = document.createElement('div');
  controls.className = 'controls';
  const motionButton = createMotionButton(opts.name, () => handle);
  controls.append(motionButton.element);

  root.append(controls, readoutList);
  opts.el.append(root);
  const surface = createHiDpiCanvas(root, opts.heightForWidth, () => draw());
  root.prepend(surface.canvas);
  surface.canvas.setAttribute('role', 'img');
  surface.canvas.setAttribute('aria-label', opts.canvasLabel);

  function draw(): void {
    const ctx = surface.context;
    if (!ctx) return;
    const size = surface.size();
    ctx.clearRect(0, 0, size.cssWidth, size.cssHeight);
    opts.draw(ctx, size, theme());
  }

  function render(): void {
    root.dataset.ticks = String(ticks);
    opts.readouts().forEach(({ value }, i) => {
      const cell = valueCells[i];
      // Writing unchanged text still costs a style recalc on every frame.
      if (cell && cell.textContent !== value) cell.textContent = value;
    });
    draw();
  }

  handle = opts.scheduler.register(root, {
    tick(dtS) {
      opts.advance(dtS);
      ticks += 1;
      render();
    },
    onStatus(status) {
      motionButton.update(status);
      opts.onStatus?.(status);
    },
  });
  const stopSchemeWatch = onSchemeChange(() => draw());
  render();

  return {
    root,
    controls,
    render,
    destroy() {
      handle?.unregister();
      handle = undefined;
      stopSchemeWatch();
      surface.destroy();
      root.remove();
    },
  };
}
