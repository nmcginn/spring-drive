// The one animation loop on the page (decision 3). Widgets register a tick
// callback against the element they draw into, and the scheduler decides,
// frame by frame, which of them tick. A widget never calls
// requestAnimationFrame, never reads the clock, and never watches its own
// visibility: those all happen here, once, so no widget can forget them.
//
// Everything that decides behaviour is a pure function or takes its browser
// dependencies through `SchedulerEnv`, so Vitest can drive it under Node with
// a fake clock and fake visibility.

/**
 * The longest step a widget is ever asked to take, in seconds. A tab returning
 * from the background, or a debugger breakpoint, can produce a frame gap of
 * minutes. Passing that through would make a detailed-mode integrator take
 * one enormous step, or thousands of small ones in a single frame. Clamping
 * means the article's clock loses the time the reader was not looking, which
 * is what they expect. 0.1 s is six frames at 60 Hz: long enough that a
 * slow device's dropped frames still advance at the right rate, short enough
 * that no widget ever jumps visibly.
 */
export const MAX_FRAME_DT_S = 0.1;

const MS_PER_S = 1000;

/** Everything that decides whether a registered widget ticks this frame. */
export interface TickInputs {
  /** The reader pressed the page's pause control. */
  globallyPaused: boolean;
  /** Any part of the widget's element is inside the viewport. */
  visible: boolean;
  /** `prefers-reduced-motion: reduce` is set. */
  reducedMotion: boolean;
  /**
   * The reader pressed this widget's own play button. The button only exists
   * under reduced motion, where it is the reader's explicit consent to
   * animate this one widget.
   */
  playRequested: boolean;
}

/**
 * Whether a widget ticks. Global pause and being offscreen always win. Under
 * reduced motion a widget stays on its static frame until the reader asks
 * for it to play.
 */
export function shouldTick(inputs: TickInputs): boolean {
  if (inputs.globallyPaused || !inputs.visible) return false;
  return !inputs.reducedMotion || inputs.playRequested;
}

/**
 * The step to hand widgets for a frame at `nowMs`, given the previous frame's
 * timestamp. The first frame after the loop (re)starts has no previous frame
 * and steps zero, so time spent paused or offscreen is never replayed. A
 * clock that runs backwards also steps zero rather than un-simulating.
 */
export function frameDtS(prevMs: number | undefined, nowMs: number, maxDtS: number = MAX_FRAME_DT_S): number {
  if (prevMs === undefined) return 0;
  const dtS = (nowMs - prevMs) / MS_PER_S;
  if (!(dtS > 0)) return 0; // also catches NaN
  return Math.min(dtS, maxDtS);
}

/** What a widget is told whenever its situation changes. */
export interface WidgetStatus extends TickInputs {
  ticking: boolean;
}

export interface Registration {
  /** Advance by `dtS` seconds and draw. Only called while ticking. */
  tick(dtS: number): void;
  /**
   * Called once on registration and again whenever any input changes. A
   * widget uses it to show its play button under reduced motion, and to
   * draw a static frame when it stops ticking.
   */
  onStatus?(status: WidgetStatus): void;
}

export interface Handle {
  /** Under reduced motion, start or stop this widget. Ignored otherwise. */
  setPlayRequested(on: boolean): void;
  status(): WidgetStatus;
  /** Stop ticking and forget the widget. Safe to call more than once. */
  unregister(): void;
}

export interface Scheduler {
  register(element: Element, registration: Registration): Handle;
  setGloballyPaused(paused: boolean): void;
  isGloballyPaused(): boolean;
  /** Subscribe to global pause changes. Returns an unsubscribe function. */
  onGlobalPauseChange(listener: (paused: boolean) => void): () => void;
  /** How many widgets are registered, ticking or not. */
  registrationCount(): number;
  /** Whether a frame is currently requested. False means the loop costs nothing. */
  isLoopRunning(): boolean;
}

/** The browser, as the scheduler sees it. Injected so tests can fake it. */
export interface SchedulerEnv {
  requestFrame(callback: (nowMs: number) => void): number;
  cancelFrame(id: number): void;
  /** Report the element's visibility now and on every change. Returns a stop function. */
  observeVisibility(element: Element, callback: (visible: boolean) => void): () => void;
  reducedMotion(): boolean;
  /** Subscribe to reduced-motion changes. Returns an unsubscribe function. */
  onReducedMotionChange(callback: (reduced: boolean) => void): () => void;
}

interface Entry {
  registration: Registration;
  visible: boolean;
  playRequested: boolean;
  ticking: boolean;
  stopObserving: () => void;
}

export function createScheduler(env: SchedulerEnv): Scheduler {
  const entries = new Set<Entry>();
  const pauseListeners = new Set<(paused: boolean) => void>();
  let globallyPaused = false;
  let reducedMotion = env.reducedMotion();
  let frameId: number | undefined;
  let prevFrameMs: number | undefined;

  function statusOf(entry: Entry): WidgetStatus {
    const inputs: TickInputs = {
      globallyPaused,
      visible: entry.visible,
      reducedMotion,
      playRequested: entry.playRequested,
    };
    return { ...inputs, ticking: shouldTick(inputs) };
  }

  function refresh(entry: Entry): void {
    const status = statusOf(entry);
    entry.ticking = status.ticking;
    entry.registration.onStatus?.(status);
  }

  function refreshAll(): void {
    for (const entry of entries) refresh(entry);
    syncLoop();
  }

  // The loop runs only while something ticks, so a page whose widgets are
  // all offscreen or paused requests no frames at all.
  function syncLoop(): void {
    const anyTicking = [...entries].some((e) => e.ticking);
    if (anyTicking && frameId === undefined) {
      prevFrameMs = undefined;
      frameId = env.requestFrame(onFrame);
    } else if (!anyTicking && frameId !== undefined) {
      env.cancelFrame(frameId);
      frameId = undefined;
    }
  }

  function onFrame(nowMs: number): void {
    frameId = undefined;
    const dtS = frameDtS(prevFrameMs, nowMs);
    prevFrameMs = nowMs;
    // Snapshot: a tick may unregister its own or another widget.
    for (const entry of [...entries]) {
      if (!entry.ticking || !entries.has(entry)) continue;
      try {
        entry.registration.tick(dtS);
      } catch (error) {
        // One broken widget must not stop the others. Logging it keeps it
        // loud: the Playwright tests fail on any console error.
        console.error(error);
      }
    }
    if ([...entries].some((e) => e.ticking)) {
      frameId = env.requestFrame(onFrame);
    }
  }

  env.onReducedMotionChange((reduced) => {
    reducedMotion = reduced;
    refreshAll();
  });

  return {
    register(element, registration) {
      const entry: Entry = {
        registration,
        visible: false,
        playRequested: false,
        ticking: false,
        stopObserving: () => {},
      };
      entries.add(entry);
      refresh(entry);
      entry.stopObserving = env.observeVisibility(element, (visible) => {
        if (!entries.has(entry) || entry.visible === visible) return;
        entry.visible = visible;
        refresh(entry);
        syncLoop();
      });
      return {
        setPlayRequested(on) {
          if (!entries.has(entry) || entry.playRequested === on) return;
          entry.playRequested = on;
          refresh(entry);
          syncLoop();
        },
        status: () => statusOf(entry),
        unregister() {
          if (!entries.delete(entry)) return;
          entry.stopObserving();
          syncLoop();
        },
      };
    },
    setGloballyPaused(paused) {
      if (paused === globallyPaused) return;
      globallyPaused = paused;
      refreshAll();
      for (const listener of pauseListeners) listener(paused);
    },
    isGloballyPaused: () => globallyPaused,
    onGlobalPauseChange(listener) {
      pauseListeners.add(listener);
      return () => pauseListeners.delete(listener);
    },
    registrationCount: () => entries.size,
    isLoopRunning: () => frameId !== undefined,
  };
}

/**
 * The real browser. This is the only place in the codebase allowed to call
 * requestAnimationFrame (lint enforces it).
 */
export function browserEnv(): SchedulerEnv {
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const visibilityCallbacks = new Map<Element, Set<(visible: boolean) => void>>();
  const observer = new IntersectionObserver((records) => {
    for (const record of records) {
      for (const callback of visibilityCallbacks.get(record.target) ?? []) {
        callback(record.isIntersecting);
      }
    }
  });
  return {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
    observeVisibility(element, callback) {
      let callbacks = visibilityCallbacks.get(element);
      if (!callbacks) {
        callbacks = new Set();
        visibilityCallbacks.set(element, callbacks);
      }
      callbacks.add(callback);
      // Observing an element already observed is a no-op, so a second
      // registration on the same element would never hear its initial
      // visibility. Re-observing forces a fresh initial report for everyone.
      observer.unobserve(element);
      observer.observe(element);
      return () => {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          observer.unobserve(element);
          visibilityCallbacks.delete(element);
        }
      };
    },
    reducedMotion: () => reducedQuery.matches,
    onReducedMotionChange(callback) {
      const listener = (event: MediaQueryListEvent) => callback(event.matches);
      reducedQuery.addEventListener('change', listener);
      return () => reducedQuery.removeEventListener('change', listener);
    },
  };
}

let pageScheduler: Scheduler | undefined;

/** The page's scheduler, created on first use. */
export function getScheduler(): Scheduler {
  pageScheduler ??= createScheduler(browserEnv());
  return pageScheduler;
}
