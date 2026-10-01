// Widget slots, and how a widget gets into one. Widgets mount lazily, as
// their slot nears the viewport, so an offscreen widget costs nothing. But
// Tab moves focus in document order whatever is on screen, and a slot whose
// widget has not mounted has no controls in it to receive focus: Tab would
// pass it by. So until it mounts, a slot is a Tab stop of its own. Focus
// arriving there mounts the widget and is handed on to the control a reader
// moving that way would meet first (decision 41).

/** What a not-yet-mounted slot is announced as, for the moment focus is on it. */
export const LOADING_LABEL = 'Interactive figure, loading';

/** Mounts a slot's widget, resolving true once it is mounted and false if it could not be. */
export type MountSlot = (slot: HTMLElement) => Promise<boolean>;

/**
 * Whether focus came from later in the document, as it does under
 * Shift+Tab, so the reader should land on the widget's last control rather
 * than its first. Focus from nowhere (the page itself) counts as forward.
 */
export function enteredBackwards(slot: Node, from: EventTarget | null): boolean {
  if (!(from instanceof Node) || from === slot) return false;
  return (slot.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** The controls in `root` a keyboard can reach, in Tab order: those not hidden or disabled. */
export function keyboardControls(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')].filter(
    (el) => !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled && el.tabIndex >= 0,
  );
}

/**
 * Make each slot mount its widget through `mount` at most once, however many
 * times it is asked (by scrolling and by focus at once, say), and stop being a
 * Tab stop once its widget is in.
 */
export function onceEach(mount: MountSlot): MountSlot {
  const pending = new WeakMap<HTMLElement, Promise<boolean>>();
  return (slot) => {
    let result = pending.get(slot);
    if (!result) {
      result = mount(slot).then((ok) => {
        if (ok) settle(slot);
        return ok;
      });
      pending.set(slot, result);
    }
    return result;
  };
}

/**
 * Put a slot in the Tab order until its widget mounts. Focus arriving there
 * mounts it, then moves to its first control, or its last when the reader
 * came backwards, unless the reader has moved focus elsewhere meanwhile.
 * Returns a function that releases the listener.
 */
export function holdTabStop(slot: HTMLElement, mount: MountSlot): () => void {
  slot.tabIndex = 0;
  slot.setAttribute('aria-label', LOADING_LABEL);
  slot.setAttribute('aria-busy', 'true');
  const onFocus = (event: FocusEvent) => {
    if (event.target !== slot) return;
    const backwards = enteredBackwards(slot, event.relatedTarget);
    void mount(slot).then((ok) => {
      if (!ok) return;
      if (document.activeElement === slot) {
        const controls = keyboardControls(slot);
        (backwards ? controls.at(-1) : controls[0])?.focus();
      }
      // Focus has moved on, so the slot can stop being focusable at all.
      if (document.activeElement !== slot) slot.removeAttribute('tabindex');
    });
  };
  slot.addEventListener('focus', onFocus);
  return () => slot.removeEventListener('focus', onFocus);
}

/**
 * A mounted slot is only the widget in it: no longer a Tab stop, label, or
 * busy. If focus is on it, its tabindex goes to -1 rather than away until
 * focus is handed on: a browser blurs a focused element that stops being
 * focusable, and focus fallen to the page's body could not be handed on.
 */
function settle(slot: HTMLElement): void {
  if (document.activeElement === slot) slot.tabIndex = -1;
  else slot.removeAttribute('tabindex');
  slot.removeAttribute('aria-label');
  slot.removeAttribute('aria-busy');
}
