// lint-as: src/sim/fixture.ts
// expect: no-restricted-properties
export function later(f: () => void): void {
  globalThis.setTimeout(f, 10);
}
