import type { SchedulerEnv } from '../../src/runtime/scheduler.ts';

/**
 * A browser for the scheduler that tests drive by hand: frames run only when
 * `frame(nowMs)` is called, and visibility and reduced motion change only
 * when the test says so. No wall-clock time is involved anywhere.
 */
export class FakeEnv implements SchedulerEnv {
  private nextId = 1;
  private pendingFrames = new Map<number, (nowMs: number) => void>();
  private visibility = new Map<Element, Set<(visible: boolean) => void>>();
  private reducedMotionListeners = new Set<(reduced: boolean) => void>();
  private reduced: boolean;
  /** Every requestFrame call ever made, for asserting the loop went idle. */
  requestCount = 0;

  constructor(options: { reducedMotion?: boolean } = {}) {
    this.reduced = options.reducedMotion ?? false;
  }

  requestFrame(callback: (nowMs: number) => void): number {
    const id = this.nextId++;
    this.pendingFrames.set(id, callback);
    this.requestCount++;
    return id;
  }

  cancelFrame(id: number): void {
    this.pendingFrames.delete(id);
  }

  observeVisibility(element: Element, callback: (visible: boolean) => void): () => void {
    let callbacks = this.visibility.get(element);
    if (!callbacks) {
      callbacks = new Set();
      this.visibility.set(element, callbacks);
    }
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  }

  reducedMotion(): boolean {
    return this.reduced;
  }

  onReducedMotionChange(callback: (reduced: boolean) => void): () => void {
    this.reducedMotionListeners.add(callback);
    return () => this.reducedMotionListeners.delete(callback);
  }

  // --- Test controls -------------------------------------------------------

  /** Run every frame callback pending at time `nowMs`, as the browser would. */
  frame(nowMs: number): void {
    const due = [...this.pendingFrames.values()];
    this.pendingFrames.clear();
    for (const callback of due) callback(nowMs);
  }

  /** Run frames at a steady interval. */
  frames(startMs: number, count: number, intervalMs: number): void {
    for (let i = 0; i < count; i++) this.frame(startMs + i * intervalMs);
  }

  pendingFrameCount(): number {
    return this.pendingFrames.size;
  }

  setVisible(element: Element, visible: boolean): void {
    for (const callback of this.visibility.get(element) ?? []) callback(visible);
  }

  observerCount(element: Element): number {
    return this.visibility.get(element)?.size ?? 0;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    for (const listener of this.reducedMotionListeners) listener(reduced);
  }
}

/** Anything with identity works as an element for the scheduler. */
export function fakeElement(): Element {
  return {} as Element;
}
