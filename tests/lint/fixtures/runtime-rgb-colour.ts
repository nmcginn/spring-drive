// lint-as: src/runtime/fixture.ts
// expect: no-restricted-syntax
export function fill(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
}
