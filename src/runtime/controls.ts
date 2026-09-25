// Shared controls. Every control is a real <button> or <input>, so it is
// focusable, works with touch and keyboard, and is announced by screen
// readers without extra work.

import type { Handle, WidgetStatus } from './scheduler.ts';

export interface ButtonOptions {
  label: string;
  onPress: () => void;
  /** Accessible name, when the visible label alone is ambiguous. */
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
