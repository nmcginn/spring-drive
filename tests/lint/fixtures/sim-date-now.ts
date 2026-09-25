// lint-as: src/sim/fixture.ts
// expect: no-restricted-properties
export const now = (): number => Date.now();
