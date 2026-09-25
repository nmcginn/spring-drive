// lint-as: src/sim/fixture.ts
// expect: no-restricted-globals
export function later(f: () => void): void {
  setTimeout(f, 10);
}
