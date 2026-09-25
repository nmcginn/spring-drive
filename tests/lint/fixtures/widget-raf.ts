// lint-as: src/widgets/fixture/index.ts
// expect: no-restricted-globals
export function spin(f: FrameRequestCallback): void {
  requestAnimationFrame(f);
}
