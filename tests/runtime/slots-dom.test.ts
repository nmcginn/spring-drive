// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enteredBackwards,
  holdTabStop,
  keyboardControls,
  LOADING_LABEL,
  onceEach,
  type MountSlot,
} from '../../src/runtime/slots.ts';

// A slot is a Tab stop until its widget mounts, so Tab never passes a widget
// that has not loaded yet (decision 41). These tests drive the slot directly;
// tests/e2e/keyboard.spec.ts proves it with a real Tab key on a page whose
// widgets are screens apart.

afterEach(() => {
  document.body.innerHTML = '';
});

/** before, slot, after: a page with a control either side of one slot. */
function page() {
  const before = Object.assign(document.createElement('button'), { textContent: 'before' });
  const slot = document.createElement('figure');
  const after = Object.assign(document.createElement('button'), { textContent: 'after' });
  document.body.append(before, slot, after);
  return { before, slot, after };
}

/** A mount that puts a widget with two visible controls and a hidden one in the slot. */
function widgetMount(): MountSlot & { calls: number } {
  const mount = Object.assign(
    async (slot: HTMLElement) => {
      mount.calls += 1;
      await Promise.resolve();
      const hidden = Object.assign(document.createElement('button'), { textContent: 'Play', hidden: true });
      const first = Object.assign(document.createElement('button'), { textContent: 'first' });
      const last = Object.assign(document.createElement('input'), { type: 'range' });
      slot.append(hidden, first, last);
      return true;
    },
    { calls: 0 },
  );
  return mount;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('enteredBackwards', () => {
  it('is true only when focus came from later in the document, as under Shift+Tab', () => {
    const { before, slot, after } = page();
    expect(enteredBackwards(slot, after)).toBe(true);
    expect(enteredBackwards(slot, before)).toBe(false);
  });

  it('counts focus from nowhere, or from the slot itself, as forward', () => {
    const { slot } = page();
    expect(enteredBackwards(slot, null)).toBe(false);
    expect(enteredBackwards(slot, slot)).toBe(false);
  });
});

describe('keyboardControls', () => {
  it('lists the controls Tab reaches, in document order, skipping hidden, disabled, and untabbable ones', () => {
    const root = document.createElement('div');
    const a = Object.assign(document.createElement('button'), { textContent: 'a' });
    const hidden = Object.assign(document.createElement('button'), { hidden: true });
    const disabled = Object.assign(document.createElement('button'), { disabled: true });
    const untabbable = Object.assign(document.createElement('button'), { tabIndex: -1 });
    const inHiddenBox = document.createElement('div');
    inHiddenBox.hidden = true;
    inHiddenBox.append(document.createElement('button'));
    const b = Object.assign(document.createElement('input'), { type: 'range' });
    root.append(a, hidden, disabled, untabbable, inHiddenBox, b);
    expect(keyboardControls(root)).toEqual([a, b]);
  });
});

describe('onceEach', () => {
  it('mounts a slot once however many times scrolling and focus ask, and gives every caller the same answer', async () => {
    const { slot } = page();
    const inner = widgetMount();
    const mount = onceEach(inner);
    const results = await Promise.all([mount(slot), mount(slot), mount(slot)]);
    expect(results).toEqual([true, true, true]);
    expect(inner.calls).toBe(1);
  });

  it('takes a mounted slot out of the Tab order, and drops its loading label', async () => {
    const { slot } = page();
    const mount = onceEach(widgetMount());
    holdTabStop(slot, mount);
    expect(slot.tabIndex).toBe(0);
    expect(slot.getAttribute('aria-label')).toBe(LOADING_LABEL);
    expect(slot.getAttribute('aria-busy')).toBe('true');
    await mount(slot);
    expect(slot.hasAttribute('tabindex')).toBe(false);
    expect(slot.hasAttribute('aria-label')).toBe(false);
    expect(slot.hasAttribute('aria-busy')).toBe(false);
  });

  it('leaves a slot whose widget failed to load in the Tab order, still announced as loading', async () => {
    const { slot } = page();
    const mount = onceEach(() => Promise.resolve(false));
    holdTabStop(slot, mount);
    expect(await mount(slot)).toBe(false);
    expect(slot.tabIndex).toBe(0);
  });
});

/**
 * Focus arriving at the slot from `from`. A real focus() carries no
 * relatedTarget, so the slot is focused before the listener is attached and
 * the event that says where focus came from is dispatched after.
 */
function focusFrom(slot: HTMLElement, mount: MountSlot, from: Element | null): void {
  slot.tabIndex = 0;
  slot.focus();
  holdTabStop(slot, mount);
  slot.dispatchEvent(new FocusEvent('focus', { relatedTarget: from }));
}

describe('holdTabStop', () => {
  it('mounts on focus and hands focus to the widget’s first control, skipping a hidden Play button', async () => {
    const { before, slot } = page();
    focusFrom(slot, onceEach(widgetMount()), before);
    await settle();
    expect(document.activeElement?.textContent).toBe('first');
  });

  it('keeps focus on the slot through mounting, then stops it being focusable once focus has moved in', async () => {
    const { before, slot } = page();
    const mount = onceEach(widgetMount());
    focusFrom(slot, mount, before);
    // Mounted with focus still on the slot: out of the Tab order, but not
    // blurred, so the handover below still has something to hand on from.
    await mount(slot);
    expect(document.activeElement === slot || document.activeElement?.textContent === 'first').toBe(true);
    await settle();
    expect(document.activeElement?.textContent).toBe('first');
    expect(slot.hasAttribute('tabindex')).toBe(false);
  });

  it('entered backwards, hands focus to the widget’s last control', async () => {
    const { after, slot } = page();
    focusFrom(slot, onceEach(widgetMount()), after);
    await settle();
    expect((document.activeElement as HTMLInputElement | null)?.type).toBe('range');
  });

  it('does not take focus back if the reader moved on while the widget loaded', async () => {
    const { before, after, slot } = page();
    focusFrom(slot, onceEach(widgetMount()), before);
    after.focus();
    await settle();
    expect(document.activeElement).toBe(after);
  });

  it('ignores focus that lands on something inside the slot rather than the slot itself', async () => {
    const { slot } = page();
    const mount = vi.fn<MountSlot>(() => Promise.resolve(true));
    holdTabStop(slot, mount);
    const inside = document.createElement('button');
    slot.append(inside);
    inside.dispatchEvent(new FocusEvent('focus', { relatedTarget: null }));
    await settle();
    expect(mount).not.toHaveBeenCalled();
  });

  it('releases its listener when asked, so a focus after that mounts nothing', async () => {
    const { slot } = page();
    const mount = vi.fn<MountSlot>(() => Promise.resolve(true));
    const release = holdTabStop(slot, mount);
    release();
    slot.dispatchEvent(new FocusEvent('focus', { relatedTarget: null }));
    await settle();
    expect(mount).not.toHaveBeenCalled();
  });
});
