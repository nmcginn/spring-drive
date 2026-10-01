import './style.css';
import { budgetRequested, mountBudgetOverlay } from './runtime/budget-overlay.ts';
import { getScheduler } from './runtime/scheduler.ts';
import { holdTabStop, onceEach } from './runtime/slots.ts';
import { WIDGETS } from './widgets/registry.ts';

/**
 * How far ahead of the viewport a slot starts loading its widget. A screen
 * height is enough for the chunk to arrive before a reader scrolling at
 * reading speed gets there, without mounting the whole article up front.
 */
const LAZY_MOUNT_MARGIN = '100% 0px';

/** Mounts a slot's widget once, whether scrolling or focus reaches it first. */
const mountSlot = onceEach(async (slot) => {
  const id = slot.dataset.widget ?? '';
  const load = WIDGETS[id];
  if (!load) {
    console.error(`No widget registered for data-widget="${id}"`);
    return false;
  }
  try {
    const { mount } = await load();
    mount(slot);
    slot.dataset.mounted = 'true';
    return true;
  } catch (error: unknown) {
    console.error(error);
    return false;
  }
});

function mountLazily(slots: HTMLElement[]): void {
  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        observer.unobserve(record.target);
        void mountSlot(record.target as HTMLElement);
      }
    },
    { rootMargin: LAZY_MOUNT_MARGIN },
  );
  for (const slot of slots) {
    // Tab reaches a slot before scrolling does, and a slot with no widget
    // in it yet has no controls to focus (decision 41).
    holdTabStop(slot, mountSlot);
    observer.observe(slot);
  }
}

function wireGlobalPause(button: HTMLButtonElement): void {
  const scheduler = getScheduler();
  // The label names the action, as the per-widget play button's does.
  const sync = (paused: boolean) => {
    button.textContent = paused ? 'Resume animations' : 'Pause animations';
  };
  button.addEventListener('click', () => scheduler.setGloballyPaused(!scheduler.isGloballyPaused()));
  scheduler.onGlobalPauseChange(sync);
  sync(scheduler.isGloballyPaused());
  button.hidden = false;
}

mountLazily([...document.querySelectorAll<HTMLElement>('[data-widget]')]);
const pauseButton = document.querySelector<HTMLButtonElement>('[data-global-pause]');
if (pauseButton) wireGlobalPause(pauseButton);
if (budgetRequested(window.location.search)) mountBudgetOverlay(getScheduler());
