// lint-as: src/widgets/fixture/index.ts
// expect: no-restricted-syntax
import type { Theme } from '../../../src/runtime/palette.ts';

export function stroke(ctx: CanvasRenderingContext2D, t: Theme): void {
  ctx.strokeStyle = t.parts.rotor;
}
