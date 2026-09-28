import { describe, expect, it } from 'vitest';
import { solveDecreasing } from '../../src/sim/solve.ts';

describe('solveDecreasing', () => {
  it('finds the root of a smooth decreasing function to the last bit or two', () => {
    const root = solveDecreasing((x) => 2 - x ** 3, 0, 10);
    // The bracket closes to adjacent doubles, so a couple of ulps of 2^(1/3).
    expect(Math.abs(root - Math.cbrt(2))).toBeLessThan(1e-15);
  });

  it('converges in far fewer evaluations than bisection would need', () => {
    let calls = 0;
    solveDecreasing(
      (x) => {
        calls++;
        return Math.exp(-x) - 0.3;
      },
      0,
      10,
    );
    // Bisection from a bracket 10 wide to adjacent doubles takes about 55.
    expect(calls).toBeLessThan(30);
  });

  it('bisects past ends where the function is not finite, and still converges', () => {
    // 1/x − 2 is +∞ at 0, and the secant cannot use it there.
    const root = solveDecreasing((x) => 1 / x - 2, 0, 1);
    expect(Math.abs(root - 0.5)).toBeLessThan(1e-15);
  });

  it('never leaves its bracket, even when the root is at an end', () => {
    const root = solveDecreasing((x) => -x, 0, 1);
    expect(root).toBeGreaterThanOrEqual(0);
    // Absolute, since the root is zero: well inside any rounding that matters.
    expect(root).toBeLessThan(1e-15);
  });

  it('returns a point it lands on exactly', () => {
    expect(solveDecreasing((x) => 0.5 - x, 0, 1)).toBe(0.5);
  });
});
