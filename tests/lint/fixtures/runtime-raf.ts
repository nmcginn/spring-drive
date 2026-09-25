// lint-as: src/runtime/canvas.ts
// expect: no-restricted-globals
export function spin(f: FrameRequestCallback): void {
  requestAnimationFrame(f);
}
