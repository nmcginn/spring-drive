// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScheduler } from '../../src/runtime/scheduler.ts';
import { mount } from '../../src/widgets/placeholder/index.ts';
import { FakeEnv } from '../runtime/fake-env.ts';

const FRAME_MS = 1000 / 60;

function setup(options: { reducedMotion?: boolean } = {}) {
  const env = new FakeEnv(options);
  const scheduler = createScheduler(env);
  const slot = document.createElement('figure');
  document.body.append(slot);
  const unmount = mount(slot, { scheduler });
  const root = () => slot.querySelector<HTMLElement>('.widget-placeholder');
  const ticks = () => Number(root()?.dataset.ticks);
  return { env, scheduler, slot, unmount, root, ticks };
}

describe('placeholder widget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('mounts a canvas, readouts with units, and a reset control', () => {
    const { root } = setup();
    expect(root()?.querySelector('canvas')).not.toBeNull();
    const values = [...(root()?.querySelectorAll('.readouts dd') ?? [])].map((dd) => dd.textContent);
    expect(values).toEqual(['0.0\u202fs', '0.50\u202frev/s']);
    expect(root()?.querySelector('button[aria-label="Reset the placeholder timer"]')).not.toBeNull();
  });

  it('advances only through the scheduler, and only while visible', () => {
    const { env, root, ticks } = setup();
    env.frames(0, 5, FRAME_MS);
    expect(ticks()).toBe(0);
    env.setVisible(root()!, true);
    env.frames(100, 5, FRAME_MS);
    expect(ticks()).toBe(5);
  });

  it('under reduced motion, draws a static frame and a Play button that starts it', () => {
    const { env, root, ticks } = setup({ reducedMotion: true });
    env.setVisible(root()!, true);
    const play = root()!.querySelector<HTMLButtonElement>('.motion-button')!;
    expect(play.hidden).toBe(false);
    expect(play.textContent).toBe('Play');
    env.frames(0, 5, FRAME_MS);
    expect(ticks()).toBe(0);

    play.click();
    expect(play.textContent).toBe('Pause');
    env.frames(100, 5, FRAME_MS);
    expect(ticks()).toBe(5);
  });

  it('hides the Play button when reduced motion is off', () => {
    const { root } = setup();
    expect(root()!.querySelector<HTMLButtonElement>('.motion-button')!.hidden).toBe(true);
  });

  it('resets its timer from the Reset button', () => {
    const { env, root } = setup();
    env.setVisible(root()!, true);
    env.frames(0, 30, FRAME_MS);
    const elapsed = () => root()!.querySelector('.readouts dd')!.textContent;
    expect(elapsed()).not.toBe('0.0\u202fs');
    root()!.querySelector<HTMLButtonElement>('button[aria-label="Reset the placeholder timer"]')!.click();
    expect(elapsed()).toBe('0.0\u202fs');
  });

  it('releases everything on unmount, and remounts cleanly', () => {
    const { env, scheduler, slot, unmount, root } = setup();
    const firstRoot = root()!;
    expect(scheduler.registrationCount()).toBe(1);
    unmount();
    expect(scheduler.registrationCount()).toBe(0);
    expect(env.observerCount(firstRoot)).toBe(0);
    expect(slot.childElementCount).toBe(0);
    expect(scheduler.isLoopRunning()).toBe(false);

    const unmountAgain = mount(slot, { scheduler });
    expect(scheduler.registrationCount()).toBe(1);
    env.setVisible(root()!, true);
    env.frames(0, 3, FRAME_MS);
    expect(Number(root()!.dataset.ticks)).toBe(3);
    unmountAgain();
    expect(scheduler.registrationCount()).toBe(0);
  });

  it('survives a huge frame gap without jumping more than the scheduler’s maximum step', () => {
    const { env, root } = setup();
    env.setVisible(root()!, true);
    env.frame(0);
    env.frame(10 * 60 * 1000);
    expect(root()!.querySelector('.readouts dd')!.textContent).toBe('0.1\u202fs');
  });
});
