import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FRAME_DT_S,
  createScheduler,
  frameDtS,
  shouldTick,
  type SchedulerEnv,
  type TickInputs,
  type WidgetStatus,
} from '../../src/runtime/scheduler.ts';
import { FRAME_WINDOW } from '../../src/runtime/budget.ts';
import { FakeEnv, fakeElement } from './fake-env.ts';

const FRAME_MS = 1000 / 60;

describe('shouldTick', () => {
  // Written out in full rather than computed, so the table is a statement of
  // the rule and not a copy of the implementation. Columns: globally paused,
  // visible, reduced motion, play requested, ticks.
  const table: [boolean, boolean, boolean, boolean, boolean][] = [
    [false, true, false, false, true], // the normal case: on screen, animating
    [false, true, false, true, true], // play requested is irrelevant without reduced motion
    [false, true, true, false, false], // reduced motion: static frame until asked
    [false, true, true, true, true], // reduced motion, reader pressed play
    [false, false, false, false, false], // offscreen
    [false, false, false, true, false],
    [false, false, true, false, false],
    [false, false, true, true, false], // offscreen wins over play
    [true, true, false, false, false], // global pause
    [true, true, false, true, false],
    [true, true, true, false, false],
    [true, true, true, true, false], // global pause wins over play
    [true, false, false, false, false],
    [true, false, false, true, false],
    [true, false, true, false, false],
    [true, false, true, true, false],
  ];

  it('has a row for every combination of its four inputs', () => {
    const keys = new Set(table.map((row) => row.slice(0, 4).join()));
    expect(keys.size).toBe(16);
  });

  for (const [globallyPaused, visible, reducedMotion, playRequested, ticks] of table) {
    const inputs: TickInputs = {
      globallyPaused,
      visible,
      reducedMotion,
      playRequested,
    };
    it(`${ticks ? 'ticks' : 'does not tick'} when ${JSON.stringify(inputs)}`, () => {
      expect(shouldTick(inputs)).toBe(ticks);
    });
  }
});

describe('frameDtS', () => {
  it('steps zero on the first frame, so time spent stopped is never replayed', () => {
    expect(frameDtS(undefined, 123_456)).toBe(0);
  });

  it('steps the real gap for an ordinary frame', () => {
    expect(frameDtS(1000, 1000 + FRAME_MS)).toBeCloseTo(1 / 60, 12);
  });

  it('steps zero for a zero gap', () => {
    expect(frameDtS(1000, 1000)).toBe(0);
  });

  it('steps zero, never negative, if the clock runs backwards', () => {
    expect(frameDtS(1000, 900)).toBe(0);
  });

  it('steps zero for a NaN timestamp', () => {
    expect(frameDtS(1000, Number.NaN)).toBe(0);
  });

  it('clamps a tab returning from ten minutes in the background to the maximum step', () => {
    expect(frameDtS(0, 10 * 60 * 1000)).toBe(MAX_FRAME_DT_S);
  });

  it('passes a gap just under the maximum through unchanged', () => {
    expect(frameDtS(0, 99)).toBeCloseTo(0.099, 12);
  });
});

describe('createScheduler', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup(options: { reducedMotion?: boolean } = {}) {
    const env = new FakeEnv(options);
    const scheduler = createScheduler(env);
    const element = fakeElement();
    const steps: number[] = [];
    const statuses: WidgetStatus[] = [];
    const handle = scheduler.register(element, {
      tick: (dtS) => steps.push(dtS),
      onStatus: (s) => statuses.push(s),
    });
    return { env, scheduler, element, steps, statuses, handle };
  }

  it('costs nothing while a widget has never been on screen: no ticks, no frames requested', () => {
    const { env, scheduler, steps } = setup();
    env.frames(0, 10, FRAME_MS);
    expect(steps).toEqual([]);
    expect(env.requestCount).toBe(0);
    expect(scheduler.isLoopRunning()).toBe(false);
  });

  it('ticks a visible widget every frame, starting from a zero step', () => {
    const { env, element, steps } = setup();
    env.setVisible(element, true);
    env.frames(1000, 4, FRAME_MS);
    expect(steps).toHaveLength(4);
    expect(steps[0]).toBe(0);
    for (const dt of steps.slice(1)) expect(dt).toBeCloseTo(1 / 60, 12);
  });

  it('stops ticking offscreen and releases the loop, then resumes without replaying the time away', () => {
    const { env, scheduler, element, steps } = setup();
    env.setVisible(element, true);
    env.frames(0, 3, FRAME_MS);
    env.setVisible(element, false);
    expect(scheduler.isLoopRunning()).toBe(false);
    expect(env.pendingFrameCount()).toBe(0);
    const before = steps.length;
    env.frames(100, 10, FRAME_MS);
    expect(steps.length).toBe(before);

    env.setVisible(element, true);
    env.frames(60_000, 2, FRAME_MS);
    expect(steps.slice(before)).toEqual([0, expect.closeTo(1 / 60, 12)]);
  });

  it('pauses mid-animation on global pause, and resumes from a zero step', () => {
    const { env, scheduler, element, steps, statuses } = setup();
    env.setVisible(element, true);
    env.frames(0, 3, FRAME_MS);
    scheduler.setGloballyPaused(true);
    expect(statuses.at(-1)).toMatchObject({
      globallyPaused: true,
      ticking: false,
    });
    expect(scheduler.isLoopRunning()).toBe(false);
    const before = steps.length;
    env.frames(100, 10, FRAME_MS);
    expect(steps.length).toBe(before);

    scheduler.setGloballyPaused(false);
    env.frames(5000, 2, FRAME_MS);
    expect(steps.slice(before)).toEqual([0, expect.closeTo(1 / 60, 12)]);
  });

  it('clamps a huge frame gap to the maximum step', () => {
    const { env, element, steps } = setup();
    env.setVisible(element, true);
    env.frame(0);
    env.frame(5 * 60 * 1000);
    expect(steps).toEqual([0, MAX_FRAME_DT_S]);
  });

  it('under reduced motion, shows a static frame until the reader presses play', () => {
    const { env, scheduler, element, steps, statuses, handle } = setup({
      reducedMotion: true,
    });
    env.setVisible(element, true);
    env.frames(0, 5, FRAME_MS);
    expect(steps).toEqual([]);
    expect(scheduler.isLoopRunning()).toBe(false);
    expect(statuses.at(-1)).toMatchObject({
      reducedMotion: true,
      playRequested: false,
      ticking: false,
    });

    handle.setPlayRequested(true);
    env.frames(100, 3, FRAME_MS);
    expect(steps).toHaveLength(3);

    handle.setPlayRequested(false);
    env.frames(200, 3, FRAME_MS);
    expect(steps).toHaveLength(3);
  });

  it('follows reduced motion when the reader changes it with the page open', () => {
    const { env, element, steps, statuses } = setup();
    env.setVisible(element, true);
    env.frames(0, 2, FRAME_MS);
    env.setReducedMotion(true);
    expect(statuses.at(-1)).toMatchObject({
      reducedMotion: true,
      ticking: false,
    });
    env.frames(100, 5, FRAME_MS);
    expect(steps).toHaveLength(2);
    env.setReducedMotion(false);
    env.frames(200, 2, FRAME_MS);
    expect(steps).toHaveLength(4);
  });

  it('keeps a reduced-motion play request across a global pause', () => {
    const { env, scheduler, element, steps, handle } = setup({
      reducedMotion: true,
    });
    env.setVisible(element, true);
    handle.setPlayRequested(true);
    scheduler.setGloballyPaused(true);
    env.frames(0, 3, FRAME_MS);
    expect(steps).toEqual([]);
    scheduler.setGloballyPaused(false);
    env.frames(100, 3, FRAME_MS);
    expect(steps).toHaveLength(3);
  });

  it('tells the widget its status on registration and on every change', () => {
    const { env, scheduler, element, statuses } = setup();
    expect(statuses).toEqual([
      {
        globallyPaused: false,
        visible: false,
        reducedMotion: false,
        playRequested: false,
        ticking: false,
      },
    ]);
    env.setVisible(element, true);
    scheduler.setGloballyPaused(true);
    expect(statuses.map((s) => s.ticking)).toEqual([false, true, false]);
  });

  it('ticks only the widgets that are on screen', () => {
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const [a, b] = [fakeElement(), fakeElement()];
    const ticks = { a: 0, b: 0 };
    scheduler.register(a, { tick: () => ticks.a++ });
    scheduler.register(b, { tick: () => ticks.b++ });
    env.setVisible(a, true);
    env.frames(0, 5, FRAME_MS);
    expect(ticks).toEqual({ a: 5, b: 0 });
  });

  it('releases everything on unregister, and a remount works like the first mount', () => {
    const { env, scheduler, element, steps, handle } = setup();
    env.setVisible(element, true);
    env.frames(0, 2, FRAME_MS);
    handle.unregister();
    expect(scheduler.registrationCount()).toBe(0);
    expect(env.observerCount(element)).toBe(0);
    expect(scheduler.isLoopRunning()).toBe(false);
    env.frames(100, 5, FRAME_MS);
    expect(steps).toHaveLength(2);
    handle.unregister(); // idempotent
    handle.setPlayRequested(true); // ignored after unregister
    expect(scheduler.registrationCount()).toBe(0);

    const again: number[] = [];
    scheduler.register(element, { tick: (dt) => again.push(dt) });
    expect(scheduler.registrationCount()).toBe(1);
    env.setVisible(element, true);
    env.frames(1000, 2, FRAME_MS);
    expect(again).toHaveLength(2);
  });

  it('survives a widget unregistering another during its own tick', () => {
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const [a, b] = [fakeElement(), fakeElement()];
    let bTicks = 0;
    const bHandle = scheduler.register(b, { tick: () => bTicks++ });
    scheduler.register(a, { tick: () => bHandle.unregister() });
    env.setVisible(a, true);
    env.setVisible(b, true);
    env.frames(0, 3, FRAME_MS);
    // b registered first, so it ticked once before a removed it.
    expect(bTicks).toBe(1);
    expect(scheduler.registrationCount()).toBe(1);
  });

  it('keeps other widgets ticking when one throws, and reports the error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const [a, b] = [fakeElement(), fakeElement()];
    let bTicks = 0;
    scheduler.register(a, {
      tick: () => {
        throw new Error('broken widget');
      },
    });
    scheduler.register(b, { tick: () => bTicks++ });
    env.setVisible(a, true);
    env.setVisible(b, true);
    env.frames(0, 3, FRAME_MS);
    expect(bTicks).toBe(3);
    expect(error).toHaveBeenCalledTimes(3);
  });

  it('notifies global pause listeners until they unsubscribe', () => {
    const { scheduler } = setup();
    const heard: boolean[] = [];
    const unsubscribe = scheduler.onGlobalPauseChange((p) => heard.push(p));
    scheduler.setGloballyPaused(true);
    scheduler.setGloballyPaused(true); // no change, no notification
    scheduler.setGloballyPaused(false);
    unsubscribe();
    scheduler.setGloballyPaused(true);
    expect(heard).toEqual([true, false]);
    expect(scheduler.isGloballyPaused()).toBe(true);
  });
});

describe('the scheduler’s frame costs (decision 39)', () => {
  /** A widget whose every tick takes `ms` on the fake clock. */
  function costing(env: FakeEnv, name: string | undefined, ms: number) {
    return {
      ...(name === undefined ? {} : { name }),
      tick: () => {
        env.clockMs += ms;
      },
    };
  }

  it('times each widget’s tick under its name, and the frame as their sum', () => {
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const [a, b] = [fakeElement(), fakeElement()];
    scheduler.register(a, costing(env, 'loop', 1.5));
    scheduler.register(b, costing(env, 'quartz', 0.5));
    env.setVisible(a, true);
    env.setVisible(b, true);
    env.frames(0, 10, FRAME_MS);
    const costs = scheduler.frameCosts();
    expect(costs.frames).toBe(10);
    expect(costs.meanMs).toBe(2);
    expect(costs.maxMs).toBe(2);
    expect(costs.widgets).toEqual([
      { name: 'loop', meanMs: 1.5, frames: 10 },
      { name: 'quartz', meanMs: 0.5, frames: 10 },
    ]);
  });

  it('counts only widgets that ticked: one offscreen costs its frames nothing', () => {
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const [a, b] = [fakeElement(), fakeElement()];
    scheduler.register(a, costing(env, 'loop', 1));
    scheduler.register(b, costing(env, 'quartz', 3));
    env.setVisible(a, true);
    env.frames(0, 5, FRAME_MS);
    expect(scheduler.frameCosts().meanMs).toBe(1);
    expect(scheduler.frameCosts().widgets.map((w) => w.name)).toEqual(['loop']);
  });

  it('records no frame while globally paused, so a pause does not flatter the mean', () => {
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const a = fakeElement();
    scheduler.register(a, costing(env, 'loop', 1));
    env.setVisible(a, true);
    env.frames(0, 3, FRAME_MS);
    scheduler.setGloballyPaused(true);
    env.frames(100, 3, FRAME_MS);
    expect(scheduler.frameCosts().frames).toBe(3);
    expect(env.pendingFrameCount()).toBe(0);
  });

  it('still times a widget whose tick throws, and the widgets after it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const [a, b] = [fakeElement(), fakeElement()];
    scheduler.register(a, {
      name: 'broken',
      tick: () => {
        env.clockMs += 2;
        throw new Error('broken widget');
      },
    });
    scheduler.register(b, costing(env, 'quartz', 1));
    env.setVisible(a, true);
    env.setVisible(b, true);
    env.frames(0, 2, FRAME_MS);
    expect(scheduler.frameCosts().meanMs).toBe(3);
    expect(scheduler.frameCosts().widgets.map((w) => w.name)).toEqual(['broken', 'quartz']);
  });

  it('names a widget registered without a name "widget", and adds up two of them', () => {
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const [a, b] = [fakeElement(), fakeElement()];
    scheduler.register(a, costing(env, undefined, 1));
    scheduler.register(b, costing(env, undefined, 2));
    env.setVisible(a, true);
    env.setVisible(b, true);
    env.frames(0, 1, FRAME_MS);
    expect(scheduler.frameCosts().widgets).toEqual([{ name: 'widget', meanMs: 3, frames: 1 }]);
  });

  it('forgets what it measured when reset, to measure from a new place on the page', () => {
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const a = fakeElement();
    scheduler.register(a, costing(env, 'loop', 1));
    env.setVisible(a, true);
    env.frames(0, 4, FRAME_MS);
    scheduler.resetFrameCosts();
    expect(scheduler.frameCosts().frames).toBe(0);
    env.frames(100, 2, FRAME_MS);
    expect(scheduler.frameCosts().frames).toBe(2);
  });

  it('measures nothing, and still ticks, in an env with no clock', () => {
    const env = new FakeEnv();
    const noClock: SchedulerEnv = {
      requestFrame: (cb) => env.requestFrame(cb),
      cancelFrame: (id) => env.cancelFrame(id),
      observeVisibility: (el, cb) => env.observeVisibility(el, cb),
      reducedMotion: () => env.reducedMotion(),
      onReducedMotionChange: (cb) => env.onReducedMotionChange(cb),
    };
    const scheduler = createScheduler(noClock);
    const a = fakeElement();
    let ticks = 0;
    scheduler.register(a, { name: 'loop', tick: () => ticks++ });
    env.setVisible(a, true);
    env.frames(0, 3, FRAME_MS);
    expect(ticks).toBe(3);
    expect(scheduler.frameCosts().frames).toBe(0);
  });

  it('keeps only the last FRAME_WINDOW frames', () => {
    const env = new FakeEnv();
    const scheduler = createScheduler(env);
    const a = fakeElement();
    scheduler.register(a, costing(env, 'loop', 1));
    env.setVisible(a, true);
    env.frames(0, FRAME_WINDOW + 50, FRAME_MS);
    expect(scheduler.frameCosts().frames).toBe(FRAME_WINDOW);
  });
});
