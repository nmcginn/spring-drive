// lint-as: src/runtime/scheduler.ts
// expect: nothing. The scheduler is the one module allowed to drive animation.
export function spin(f: FrameRequestCallback): void {
  window.requestAnimationFrame(f);
}
