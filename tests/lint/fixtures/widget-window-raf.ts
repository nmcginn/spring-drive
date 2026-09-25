// lint-as: src/widgets/fixture/index.ts
// expect: no-restricted-properties
export function spin(f: FrameRequestCallback): void {
  window.requestAnimationFrame(f);
}
