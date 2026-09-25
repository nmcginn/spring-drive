import './style.css';
import { getScheduler } from './runtime/scheduler.ts';
import { WIDGETS } from './widgets/registry.ts';

/**
 * How far ahead of the viewport a slot starts loading its widget. A screen
 * height is enough for the chunk to arrive before a reader scrolling at
 * reading speed gets there, without mounting the whole article up front.
 */
const LAZY_MOUNT_MARGIN = '100% 0px';

function mountSlot(slot: HTMLElement): void {
  const id = slot.dataset.widget ?? '';
  const load = WIDGETS[id];
  if (!load) {
    console.error(`No widget registered for data-widget="${id}"`);
    return;
  }
  load()
    .then(({ mount }) => {
      mount(slot);
      slot.dataset.mounted = 'true';
    })
    .catch((error: unknown) => console.error(error));
}

function mountLazily(slots: HTMLElement[]): void {
  const observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        observer.unobserve(record.target);
        mountSlot(record.target as HTMLElement);
      }
    },
    { rootMargin: LAZY_MOUNT_MARGIN },
  );
  for (const slot of slots) observer.observe(slot);
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
