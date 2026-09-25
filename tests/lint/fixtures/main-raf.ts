// lint-as: src/main.ts
// expect: no-restricted-globals
export function spin(f: FrameRequestCallback): void {
  requestAnimationFrame(f);
}
