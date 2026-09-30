// lint-as: src/widgets/shared/colours.ts
// expect: nothing.
import type { Theme } from '../../../src/runtime/palette.ts';

export function rotor(t: Theme): string {
  return t.parts.rotor;
}
