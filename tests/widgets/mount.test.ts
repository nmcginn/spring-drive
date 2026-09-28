// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createScheduler } from '../../src/runtime/scheduler.ts';
import { mount as mountGenerator } from '../../src/widgets/generator/index.ts';
import { mount as mountHero } from '../../src/widgets/hero-glide/index.ts';
import { mount as mountLenz } from '../../src/widgets/lenz-brake/index.ts';
import { mount as mountLoop } from '../../src/widgets/loop/index.ts';
import { mount as mountQuartz } from '../../src/widgets/quartz/index.ts';
import { mount as mountRunaway } from '../../src/widgets/runaway/index.ts';
import { mount as mountTri } from '../../src/widgets/tri-synchro/index.ts';
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
  { id: 'generator', mount: mountGenerator, className: 'widget-generator' },
  { id: 'lenz-brake', mount: mountLenz, className: 'widget-lenz-brake' },
  { id: 'quartz', mount: mountQuartz, className: 'widget-quartz' },
  { id: 'loop', mount: mountLoop, className: 'widget-loop' },
  { id: 'tri-synchro', mount: mountTri, className: 'widget-tri-synchro' },
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
      // The Play button, and at least one control of the widget's own: a
      // button, or a slider, which is all the quartz widget needs.
      expect(root().querySelectorAll('.controls .motion-button').length).toBe(1);
      expect(root().querySelectorAll('.controls button:not(.motion-button), .controls input').length).toBeGreaterThan(
        0,
      );
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

describe('generator: controls', () => {
  const generator = WIDGETS[2];
  const slider = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input[type="range"]')!;
  function drag(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('has a speed slider, its primary control, labelled and starting at 8 rev/s', () => {
    const { root } = setup(generator);
    const input = slider(root());
    expect(input.closest('label')?.textContent).toBe('Glide wheel speed');
    expect(input.value).toBe('8');
    expect(input.getAttribute('aria-valuetext')).toBe('8.0\u202frev/s');
  });

  it('sets the speed, and the EMF readouts follow it, even while not animating', () => {
    const { root, values } = setup(generator);
    drag(slider(root()), '16');
    expect(values().slice(0, 4)).toEqual(['16.0\u202frev/s', '16.0\u202fHz', '3.14\u202fV', '2.00\u202fV']);
    drag(slider(root()), '0');
    expect(values()[2]).toBe('0.00\u202fV');
  });

  it('keeps the speed it was given across animation, pause, and resume', () => {
    const { env, scheduler, root, values } = setup(generator);
    env.setVisible(root(), true);
    env.frames(0, 10, FRAME_MS);
    drag(slider(root()), '4.5');
    env.frames(500, 10, FRAME_MS);
    scheduler.setGloballyPaused(true);
    drag(slider(root()), '12');
    scheduler.setGloballyPaused(false);
    env.frames(2000, 10, FRAME_MS);
    expect(values()[0]).toBe('12.0\u202frev/s');
  });

  it('switches to slow motion and back', () => {
    const { button, values } = setup(generator);
    const slow = button('Slow motion for the generator, one eighth of real time');
    slow.click();
    expect(slow.getAttribute('aria-pressed')).toBe('true');
    expect(values()).toContain('1/8× real time');
    slow.click();
    expect(values()).toContain('1× real time');
  });

  it('survives a ten-minute frame gap as one clamped 0.1 s step', () => {
    const { env, root, ticks, values } = setup(generator);
    env.setVisible(root(), true);
    env.frame(0);
    env.frame(10 * 60 * 1000);
    expect(ticks()).toBe(2);
    expect(values()[0]).toBe('8.0\u202frev/s');
  });
});

describe('lenz-brake: controls', () => {
  const lenz = WIDGETS[3];
  const LET_GO = 'Let the glide wheel go from 8 rev/s';
  const slider = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input[type="range"]')!;
  function drag(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('has a coil-load slider, its primary control, labelled and starting a quarter of the time shorted', () => {
    const { root } = setup(lenz);
    const input = slider(root());
    expect(input.closest('label')?.textContent).toBe('Coil shorted');
    expect(input.value).toBe('0.25');
    expect(input.getAttribute('aria-valuetext')).toBe('25\u202f% of the time');
  });

  it('sets the brake torque from the slider, even while not animating', () => {
    const { root, values } = setup(lenz);
    drag(slider(root()), '1');
    expect(values().slice(1, 3)).toEqual(['100\u202f%', '198.9\u202fnN·m']);
    drag(slider(root()), '0');
    expect(values().slice(1, 3)).toEqual(['0\u202f%', '0.0\u202fnN·m']);
  });

  it('lets the wheel go and it coasts to a stop on frames the scheduler gives it', () => {
    const { env, root, button, values } = setup(lenz);
    env.setVisible(root(), true);
    env.frames(0, 2, FRAME_MS);
    button(LET_GO).click();
    env.frames(100, 5, FRAME_MS);
    expect(parseFloat(values()[0]!)).toBeLessThan(8);
    expect(parseFloat(values()[0]!)).toBeGreaterThan(0);
    env.frames(1000, 60, FRAME_MS);
    expect(values()[0]).toBe('0.00\u202frev/s');
    // PHYSICS.md, D10: a quarter of the time shorted stops it in 0.299 s.
    expect(values()[5]).toBe('0.299\u202fs');
  });

  it('under reduced motion, letting go shows the finished run in the still frame', () => {
    const { env, root, button, ticks, values } = setup(lenz, { reducedMotion: true });
    env.setVisible(root(), true);
    button(LET_GO).click();
    env.frames(0, 5, FRAME_MS);
    expect(ticks()).toBe(0);
    expect(values()[0]).toBe('0.00\u202frev/s');
    expect(values()[5]).toBe('0.299\u202fs');
  });

  it('paused mid-run, holds still, and carries on from where it was when resumed', () => {
    const { env, scheduler, root, button, values } = setup(lenz);
    env.setVisible(root(), true);
    env.frames(0, 2, FRAME_MS);
    button(LET_GO).click();
    env.frames(100, 6, FRAME_MS);
    scheduler.setGloballyPaused(true);
    const frozen = values();
    env.frames(1000, 30, FRAME_MS);
    expect(values()).toEqual(frozen);
    scheduler.setGloballyPaused(false);
    env.frames(5000, 60, FRAME_MS);
    expect(values()[5]).toBe('0.299\u202fs');
  });

  it('survives a ten-minute frame gap mid-run as one clamped 0.1 s step', () => {
    const { env, root, button, values } = setup(lenz);
    env.setVisible(root(), true);
    env.frame(0);
    button(LET_GO).click();
    env.frame(10 * 60 * 1000);
    expect(values()[5]).toBe('0.100\u202fs');
  });

  it('switches to slow motion and back', () => {
    const { button, values } = setup(lenz);
    const slow = button('Slow motion for the coil brake, one eighth of real time');
    slow.click();
    expect(slow.getAttribute('aria-pressed')).toBe('true');
    expect(values()).toContain('1/8× real time');
    slow.click();
    expect(values()).toContain('1× real time');
  });
});

describe('quartz: controls', () => {
  const quartz = WIDGETS[4];
  const slider = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input[type="range"]')!;
  function drag(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('has a slow-down slider, its primary control, labelled and starting at 1/64 of real time', () => {
    const { root } = setup(quartz);
    const input = slider(root());
    expect(input.closest('label')?.textContent).toBe('Slow the crystal down');
    expect([input.min, input.max, input.step, input.value]).toEqual(['0', '12', '1', '6']);
    expect(input.getAttribute('aria-valuetext')).toBe('1/64 of real time');
  });

  it('sets the speed from the slider, and the readouts follow, even while not animating', () => {
    const { root, values } = setup(quartz);
    drag(slider(root()), '12');
    expect(values().slice(0, 3)).toEqual(['1/4,096× real time', '8\u202fHz', '8\u202fmin 32\u202fs']);
    drag(slider(root()), '0');
    expect(values().slice(0, 3)).toEqual(['1× real time', '32,768\u202fHz', '0.125\u202fs']);
    expect(slider(root()).getAttribute('aria-valuetext')).toBe('real time');
  });

  it('counts the crystal on frames the scheduler gives it: a second at real time gives eight ticks', () => {
    const { env, root, values } = setup(quartz);
    drag(slider(root()), '0');
    env.setVisible(root(), true);
    // The first frame steps zero; the next 61 step a sixtieth of a second each.
    env.frames(0, 62, FRAME_MS);
    expect(values()[4]).toBe('8\u202fticks');
  });

  it('carries the count on across a change of speed, pause, and resume', () => {
    const { env, scheduler, root, values } = setup(quartz);
    drag(slider(root()), '0');
    env.setVisible(root(), true);
    // 31 steps of a sixtieth, clear of the tick at exactly half a second,
    // which summed frames can land a hair either side of.
    env.frames(0, 32, FRAME_MS);
    expect(values()[4]).toBe('4\u202fticks');
    scheduler.setGloballyPaused(true);
    drag(slider(root()), '12');
    expect(values()[4]).toBe('4\u202fticks');
    scheduler.setGloballyPaused(false);
    drag(slider(root()), '0');
    env.frames(5000, 31, FRAME_MS);
    // Half a second more (the frame after resuming steps zero): 1.017 s in all, 8.13 ticks.
    expect(values()[4]).toBe('8\u202fticks');
  });

  it('survives a ten-minute frame gap as one clamped 0.1 s step', () => {
    const { env, root, ticks, values } = setup(quartz);
    drag(slider(root()), '0');
    env.setVisible(root(), true);
    env.frame(0);
    env.frame(10 * 60 * 1000);
    expect(ticks()).toBe(2);
    // 0.1 s at real time is 3,276.8 cycles: no tick given yet.
    expect(values().slice(3)).toEqual(['3,276\u202fcycles', '0\u202fticks']);
  });
});

describe('tri-synchro: controls', () => {
  const tri = WIDGETS[6];
  const WIND = 'Wind the mainspring fully and start the reserve again from 0 h';
  const SKIP = 'Skip six hours ahead';
  const slider = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input[type="range"]')!;
  function drag(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('has a time slider, its primary control, labelled and starting at an hour a second', () => {
    const { root, values } = setup(tri);
    const input = slider(root());
    expect(input.closest('label')?.textContent).toBe('Time runs at');
    expect([input.min, input.max, input.step, input.value]).toEqual(['0', '3', '1', '2']);
    expect(input.getAttribute('aria-valuetext')).toBe('1 hour each second');
    expect(values()[1]).toBe('1\u202fh/s');
  });

  it('sets how fast time runs from the slider, and hours pass at that rate on frames the scheduler gives it', () => {
    const { env, root, values } = setup(tri);
    drag(slider(root()), '3');
    expect(values()[1]).toBe('2\u202fh/s');
    env.setVisible(root(), true);
    // The first frame steps zero; the next 60 step a sixtieth of a second each: two hours.
    env.frames(0, 61, FRAME_MS);
    expect(values()[0]).toBe('2\u202fh 00\u202fmin');
    expect(values()[2]).toBe('70.0\u202fh');
  });

  it('skips six hours from its button, even while not animating, and winds back to full', () => {
    const { button, values, ticks } = setup(tri);
    button(SKIP).click();
    expect(ticks()).toBe(0);
    expect(values()[0]).toBe('6\u202fh 00\u202fmin');
    expect(values()[2]).toBe('66.0\u202fh');
    button(WIND).click();
    expect(values()[0]).toBe('0.0\u202fs');
    expect(values()[2]).toBe('72.0\u202fh');
  });

  it('under reduced motion, skipping to the end shows the stopped watch in the still frame', () => {
    const { env, root, button, ticks, values } = setup(tri, { reducedMotion: true });
    env.setVisible(root(), true);
    for (let i = 0; i < 13; i++) button(SKIP).click();
    env.frames(0, 5, FRAME_MS);
    expect(ticks()).toBe(0);
    expect(values()[3]).toBe('0.000\u202frev/s');
    expect(values()[5]).toBe('0.891\u202fV');
    expect(root().querySelector('.widget-note')?.textContent).toContain('±15 s/month');
  });

  it('paused mid-run, holds still, and carries on from where it was when resumed', () => {
    const { env, scheduler, root, values } = setup(tri);
    env.setVisible(root(), true);
    env.frames(0, 31, FRAME_MS);
    scheduler.setGloballyPaused(true);
    const frozen = values();
    env.frames(1000, 30, FRAME_MS);
    expect(values()).toEqual(frozen);
    scheduler.setGloballyPaused(false);
    env.frames(5000, 31, FRAME_MS);
    // Half an hour before the pause and half an hour after it, and none of the paused time.
    // Thirty frames of a sixtieth sum to a hair under half a second, and the clock floors.
    expect(frozen[0]).toBe('29\u202fmin 59\u202fs');
    expect(values()[0]).toBe('59\u202fmin 59\u202fs');
  });

  it('survives a ten-minute frame gap as one clamped 0.1 s step: 6 min of sim time at 1 h/s', () => {
    const { env, root, ticks, values } = setup(tri);
    env.setVisible(root(), true);
    env.frame(0);
    env.frame(10 * 60 * 1000);
    expect(ticks()).toBe(2);
    expect(values()[0]).toBe('6\u202fmin 00\u202fs');
    expect(values()[3]).toBe('8.000\u202frev/s');
  });
});
