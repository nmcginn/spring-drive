// lint-as: src/sim/fixture.ts
// expect: no-restricted-globals
export function every(f: () => void): void {
  setInterval(f, 10);
}
