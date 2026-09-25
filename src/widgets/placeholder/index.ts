import { createHiDpiCanvas } from '../../runtime/canvas.ts';
import { createButton, createMotionButton } from '../../runtime/controls.ts';
import { onSchemeChange, theme } from '../../runtime/palette.ts';
import { getScheduler, type Handle, type Scheduler } from '../../runtime/scheduler.ts';
import { advance, heightForWidth, initialState, readouts, wheelGeometry, type PlaceholderState } from './logic.ts';

export interface Options {
  /** Injected by tests. Widgets on the page share the page's scheduler. */
  scheduler?: Scheduler;
}

const WIDGET_NAME = 'placeholder animation';

export function mount(el: HTMLElement, opts: Options = {}): () => void {
  const scheduler = opts.scheduler ?? getScheduler();
  let state: PlaceholderState = initialState;
  let handle: Handle | undefined;

  const root = document.createElement('div');
  root.className = 'widget widget-placeholder';

  const readoutList = document.createElement('dl');
  readoutList.className = 'readouts';
  const valueCells = readouts(state).map(({ label }) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    readoutList.append(dt, dd);
    return dd;
  });

  const controls = document.createElement('div');
  controls.className = 'controls';
  const motionButton = createMotionButton(WIDGET_NAME, () => handle);
  const resetButton = createButton({
    label: 'Reset',
    ariaLabel: 'Reset the placeholder timer',
    onPress: () => {
      state = initialState;
      render();
    },
  });
  controls.append(motionButton.element, resetButton);

  root.append(readoutList, controls);
  el.append(root);
  const surface = createHiDpiCanvas(root, heightForWidth, () => render());
  root.prepend(surface.canvas);
  surface.canvas.setAttribute('role', 'img');
  surface.canvas.setAttribute('aria-label', 'A marker turning around a circle');

  function render(): void {
    root.dataset.ticks = String(state.ticks);
    readouts(state).forEach(({ value }, i) => {
      const cell = valueCells[i];
      // Writing unchanged text still costs a style recalc on every frame.
      if (cell && cell.textContent !== value) cell.textContent = value;
    });
    draw();
  }

  function draw(): void {
    const ctx = surface.context;
    if (!ctx) return;
    const { cssWidth, cssHeight } = surface.size();
    const { parts, ui } = theme();
    const g = wheelGeometry(cssWidth, cssHeight, state.angleRad);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.lineWidth = 2;
    ctx.strokeStyle = parts.rotor;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = ui.muted;
    ctx.beginPath();
    ctx.moveTo(g.cx, g.cy);
    ctx.lineTo(g.markerX, g.markerY);
    ctx.stroke();
    ctx.fillStyle = parts.rotor;
    ctx.beginPath();
    ctx.arc(g.markerX, g.markerY, 6, 0, 2 * Math.PI);
    ctx.fill();
  }

  handle = scheduler.register(root, {
    tick(dtS) {
      state = advance(state, dtS);
      render();
    },
    onStatus(status) {
      motionButton.update(status);
    },
  });
  const stopSchemeWatch = onSchemeChange(() => draw());
  render();

  return () => {
    handle?.unregister();
    handle = undefined;
    stopSchemeWatch();
    surface.destroy();
    root.remove();
  };
}
