// Shared controls. Every control is a real <button> or <input>, so it is
// focusable, works with touch and keyboard, and is announced by screen
// readers without extra work.

import type { Handle, WidgetStatus } from './scheduler.ts';

export interface ButtonOptions {
  label: string;
  onPress: () => void;
  /**
   * Accessible name, when the visible label alone is ambiguous. It begins
   * with the visible label, so a reader using voice control can say what
   * they see (WCAG 2.5.3, Label in Name; decision 41).
   */
  ariaLabel?: string;
}

export function createButton(options: ButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'control-button';
  button.textContent = options.label;
  if (options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
  button.addEventListener('click', options.onPress);
  return button;
}

/** What the per-widget motion button shows, or null when it is hidden. */
export function motionButtonState(status: WidgetStatus): { label: 'Play' | 'Pause' } | null {
  // The button exists only under reduced motion. Without it, the widget
  // animates whenever it is on screen and the page is not paused.
  if (!status.reducedMotion) return null;
  return { label: status.playRequested ? 'Pause' : 'Play' };
}

export interface MotionButton {
  element: HTMLButtonElement;
  /** Pass every status the scheduler reports. */
  update(status: WidgetStatus): void;
}

/**
 * The play button a widget shows under `prefers-reduced-motion`. It starts on
 * Play, over the widget's static frame, and animating is the reader's choice.
 */
export function createMotionButton(widgetName: string, getHandle: () => Handle | undefined): MotionButton {
  const element = createButton({
    label: 'Play',
    ariaLabel: `Play ${widgetName}`,
    onPress: () => {
      const handle = getHandle();
      if (handle) handle.setPlayRequested(!handle.status().playRequested);
    },
  });
  element.classList.add('motion-button');
  element.hidden = true;
  return {
    element,
    update(status) {
      const state = motionButtonState(status);
      element.hidden = state === null;
      if (!state) return;
      element.textContent = state.label;
      // The label names the action, so it is not also a toggle with
      // aria-pressed: "Pause, pressed" would announce the state twice.
      element.setAttribute('aria-label', `${state.label} ${widgetName}`);
    },
  };
}

export interface ToggleOptions {
  /** The visible label. It names the mode, and stays the same when on or off. */
  label: string;
  /** Accessible name, when the visible label alone is ambiguous. */
  ariaLabel?: string;
  initial?: boolean;
  onChange: (on: boolean) => void;
}

export interface Toggle {
  element: HTMLButtonElement;
  isOn(): boolean;
  /** Set the state without calling `onChange`, as when the widget resets. */
  set(on: boolean): void;
}

/**
 * A button that switches a mode on and off, such as slow motion. Unlike the
 * Play button, its label names the mode rather than the action, so its
 * state is carried by `aria-pressed`, which screen readers announce, and
 * shown by the `.control-button[aria-pressed="true"]` style.
 */
export function createToggle(options: ToggleOptions): Toggle {
  let on = options.initial ?? false;
  const element = createButton({
    label: options.label,
    ...(options.ariaLabel === undefined ? {} : { ariaLabel: options.ariaLabel }),
    onPress: () => {
      on = !on;
      sync();
      options.onChange(on);
    },
  });
  element.classList.add('control-toggle');
  const sync = () => element.setAttribute('aria-pressed', String(on));
  sync();
  return {
    element,
    isOn: () => on,
    set(next) {
      on = next;
      sync();
    },
  };
}

/**
 * A slider's value from its input's text: clamped to [min, max] and snapped
 * to the nearest whole step from `min`, as the browser does for a range
 * input, and rounded so 0.1 steps read back as 8.1 rather than 8.100000000000001.
 * Text that is not a number (a stale or tampered input) falls back to `fallback`.
 */
export function sliderValue(raw: string, min: number, max: number, step: number, fallback: number): number {
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(n)) return fallback;
  const snapped = min + Math.round((Math.min(max, Math.max(min, n)) - min) / step) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Math.min(max, Number(snapped.toFixed(decimals)));
}

export interface SliderOptions {
  /** The visible label. It names the quantity the slider sets. */
  label: string;
  /**
   * The slider's accessible name: its visible label, then what it acts on,
   * so it stands alone in a screen reader's list of the page's controls,
   * where "Coil shorted" alone says nothing of which widget it belongs to.
   * Required, because every slider on the page needs one (decision 41).
   */
  ariaLabel: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  /** The value with its unit, for screen readers ("8.0 rev/s"), announced as the slider moves. */
  valueText: (value: number) => string;
  /** Called on every movement, while dragging as well as on release. */
  onInput: (value: number) => void;
}

export interface Slider {
  /** The label wrapping the input; append this to the controls. */
  element: HTMLLabelElement;
  input: HTMLInputElement;
  value(): number;
}

/**
 * A native range input under a visible label. Native, so it drags by touch,
 * steps with the arrow keys (and PageUp, PageDown, Home, and End), and is
 * announced as a slider, with no extra code; `aria-label` names it, and
 * `aria-valuetext` adds the unit to what is announced.
 */
export function createSlider(options: SliderOptions): Slider {
  const element = document.createElement('label');
  element.className = 'control-slider';
  const text = document.createElement('span');
  text.className = 'control-slider-label';
  text.textContent = options.label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.value = String(options.initial);
  input.setAttribute('aria-label', options.ariaLabel);
  element.append(text, input);

  let current = options.initial;
  const sync = () => input.setAttribute('aria-valuetext', options.valueText(current));
  sync();
  input.addEventListener('input', () => {
    current = sliderValue(input.value, options.min, options.max, options.step, current);
    sync();
    options.onInput(current);
  });
  return { element, input, value: () => current };
}
