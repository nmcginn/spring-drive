// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createScheduler } from '../../src/runtime/scheduler.ts';
import { mount as mountHero } from '../../src/widgets/hero-glide/index.ts';
import { mount as mountRunaway } from '../../src/widgets/runaway/index.ts';
import { FakeEnv } from '../runtime/fake-env.ts';

// The widget contract (ROADMAP.md, "Widget done-when"), checked for every
// widget without a browser: mount(el, opts) returns an unmount function, the
// widget advances only through the scheduler and only while visible, respects
// global pause and reduced motion, survives a huge frame gap, and unmount
// releases everything so a remount starts clean. happy-dom has no canvas
// context, so these run every widget's logic but none of its drawing.

const FRAME_MS = 1000 / 60;

const WIDGETS = [
  { id: 'hero-glide', mount: mountHero, className: 'widget-hero-glide' },
  { id: 'runaway', mount: mountRunaway, className: 'widget-runaway' },
] as const;

function setup(w: (typeof WIDGETS)[number], options: { reducedMotion?: boolean } = {}) {
  const env = new FakeEnv(options);
  const scheduler = createScheduler(env);
  const slot = document.createElement('figure');
  document.body.append(slot);
  const unmount = w.mount(slot, { scheduler });
  const root = () => slot.querySelector<HTMLElement>(`.${w.className}`)!;
  const ticks = () => Number(root().dataset.ticks);
  const values = () => [...root().querySelectorAll('.readouts dd')].map((dd) => dd.textContent ?? '');
  const button = (name: string) => root().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  return { env, scheduler, slot, unmount, root, ticks, values, button };
}

afterEach(() => {
  document.body.innerHTML = '';
});

for (const w of WIDGETS) {
  describe(`${w.id}: the widget contract`, () => {
    it('mounts a labelled canvas, readouts, and controls into its slot', () => {
      const { root } = setup(w);
      expect(root().querySelector('canvas')?.getAttribute('role')).toBe('img');
      expect(root().querySelector('canvas')?.getAttribute('aria-label')).toBeTruthy();
      expect(root().querySelectorAll('.readouts dd').length).toBeGreaterThan(2);
      expect(root().querySelectorAll('.controls button').length).toBeGreaterThan(1);
    });

    it('puts a unit on every readout from the first frame', () => {
      const { values } = setup(w);
      // Every value has a unit after a narrow no-break space, or is a ratio
      // or angle whose unit is its symbol.
      for (const value of values()) expect(value).toMatch(/\u202f\S|×|°/);
    });

    it('advances only through the scheduler, and only while visible', () => {
      const { env, root, ticks } = setup(w);
      env.frames(0, 5, FRAME_MS);
      expect(ticks()).toBe(0);
      env.setVisible(root(), true);
      env.frames(100, 5, FRAME_MS);
      expect(ticks()).toBe(5);
      env.setVisible(root(), false);
      env.frames(200, 5, FRAME_MS);
      expect(ticks()).toBe(5);
    });

    it('stops on global pause mid-animation and resumes after it, without replaying the paused time', () => {
      const { env, scheduler, root, ticks, values } = setup(w);
      env.setVisible(root(), true);
      env.frames(0, 10, FRAME_MS);
      scheduler.setGloballyPaused(true);
      const frozen = values();
      env.frames(1000, 10, FRAME_MS);
      expect(ticks()).toBe(10);
      expect(values()).toEqual(frozen);
      scheduler.setGloballyPaused(false);
      env.frames(60_000, 3, FRAME_MS);
      expect(ticks()).toBe(13);
    });

    it('under reduced motion, draws a static frame and a Play button that starts and stops it', () => {
      const { env, root, ticks } = setup(w, { reducedMotion: true });
      env.setVisible(root(), true);
      const play = root().querySelector<HTMLButtonElement>('.motion-button')!;
      expect(play.hidden).toBe(false);
      expect(play.textContent).toBe('Play');
      env.frames(0, 5, FRAME_MS);
      expect(ticks()).toBe(0);
      play.click();
      env.frames(100, 5, FRAME_MS);
      expect(ticks()).toBe(5);
      play.click();
      expect(play.textContent).toBe('Play');
      env.frames(200, 5, FRAME_MS);
      expect(ticks()).toBe(5);
    });

    it('hides the Play button when reduced motion is off, and shows it when the reader turns it on', () => {
      const { env, root } = setup(w);
      const play = root().querySelector<HTMLButtonElement>('.motion-button')!;
      expect(play.hidden).toBe(true);
      env.setReducedMotion(true);
      expect(play.hidden).toBe(false);
    });

    it('releases everything on unmount, and remounts cleanly', () => {
      const { env, scheduler, slot, unmount, root } = setup(w);
      const first = root();
      env.setVisible(first, true);
      env.frames(0, 3, FRAME_MS);
      expect(scheduler.registrationCount()).toBe(1);
      unmount();
      expect(scheduler.registrationCount()).toBe(0);
      expect(env.observerCount(first)).toBe(0);
      expect(slot.childElementCount).toBe(0);
      expect(scheduler.isLoopRunning()).toBe(false);

      const unmountAgain = w.mount(slot, { scheduler });
      const second = slot.querySelector<HTMLElement>(`.${w.className}`)!;
      expect(second.dataset.ticks).toBe('0');
      env.setVisible(second, true);
      env.frames(1000, 3, FRAME_MS);
      expect(second.dataset.ticks).toBe('3');
      unmountAgain();
      expect(scheduler.registrationCount()).toBe(0);
    });
  });
}

describe('hero-glide: controls', () => {
  const hero = WIDGETS[0];

  it('survives a ten-minute frame gap (a tab back from the background) as one clamped 0.1 s step', () => {
    const { env, root, ticks } = setup(hero);
    env.setVisible(root(), true);
    env.frame(0);
    env.frame(10 * 60 * 1000);
    expect(ticks()).toBe(2);
    // Still regulated: a long gap cannot knock the wheel off 8 rev/s.
    expect(root().querySelector('.readouts dd')?.textContent).toBe('8.000\u202frev/s');
  });

  it('switches to slow motion and back from its primary control', () => {
    const { button, values } = setup(hero);
    const slow = button('Slow motion, one eighth of real time');
    expect(slow.getAttribute('aria-pressed')).toBe('false');
    slow.click();
    expect(slow.getAttribute('aria-pressed')).toBe('true');
    expect(values()).toContain('1/8× real time');
    slow.click();
    expect(values()).toContain('1× real time');
  });
});

describe('runaway: controls', () => {
  const runaway = WIDGETS[1];

  it('winds the spring from its primary control, even while not animating', () => {
    const { button, values } = setup(runaway);
    expect(values()).toContain('0.0\u202f%');
    button('Wind the mainspring fully and set the hands to 12:00').click();
    expect(values()).toContain('100.0\u202f%');
  });

  it('spins up after winding, on frames the scheduler gives it', () => {
    const { env, root, button, values } = setup(runaway);
    env.setVisible(root(), true);
    button('Wind the mainspring fully and set the hands to 12:00').click();
    env.frames(0, 120, FRAME_MS);
    expect(parseFloat(values()[0]!)).toBeGreaterThan(20);
  });

  it('fast-forwards from its toggle, so hours pass in seconds, and switches back', () => {
    const { env, root, button, values } = setup(runaway);
    env.setVisible(root(), true);
    button('Wind the mainspring fully and set the hands to 12:00').click();
    const ff = button('Fast-forward, one hour each second');
    ff.click();
    expect(ff.getAttribute('aria-pressed')).toBe('true');
    env.frames(0, 120, FRAME_MS);
    // Two seconds of page time, two hours of sim time, less the first frame,
    // which steps zero.
    expect(values()[3]).toBe('1\u202fh 58\u202fmin');
    ff.click();
    expect(ff.getAttribute('aria-pressed')).toBe('false');
    env.frames(5000, 60, FRAME_MS);
    expect(values()[3]).toBe('1\u202fh 59\u202fmin');
  });

  it('survives a ten-minute frame gap in fast-forward as one clamped step: 0.1 s of page time, 6 min of sim time', () => {
    const { env, root, button, values } = setup(runaway);
    env.setVisible(root(), true);
    button('Wind the mainspring fully and set the hands to 12:00').click();
    button('Fast-forward, one hour each second').click();
    env.frame(0);
    env.frame(10 * 60 * 1000);
    expect(values()[3]).toBe('6\u202fmin 00\u202fs');
  });
});
