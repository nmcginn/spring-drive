// Root finding for averaged mode's balances. Each is a decreasing function of
// one variable, bracketed, and evaluated some 10⁵ times a run-down, so the
// solver needs to converge fast and never leave its bracket.

/** More than enough steps to close any bracket to one ulp; the loop stops sooner when it does. */
const MAX_STEPS = 200;

/**
 * The root of `f` in [lo, hi], where f(lo) > 0 ≥ f(hi): the Illinois form of
 * false position. Each step takes the secant through the bracket's ends, and
 * halves the value kept at an end that has stayed put twice, so both ends
 * close in, superlinearly on a smooth function. Where an end's value is not
 * finite (a balance can run off to infinity at the edge of its range), or the
 * secant would land outside the bracket, it bisects instead. It returns the
 * last point tried, once the bracket has closed to adjacent doubles or `f` is
 * exactly zero.
 */
export function solveDecreasing(f: (x: number) => number, lo0: number, hi0: number): number {
  let lo = lo0;
  let hi = hi0;
  let fLo = f(lo);
  let fHi = f(hi);
  let x = (lo + hi) / 2;
  let kept = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (mid <= lo || mid >= hi) return mid;
    x = Number.isFinite(fLo) && Number.isFinite(fHi) && fLo > fHi ? lo + (fLo * (hi - lo)) / (fLo - fHi) : mid;
    if (!(x > lo && x < hi)) x = mid;
    const fx = f(x);
    if (fx === 0) return x;
    if (fx > 0) {
      lo = x;
      fLo = fx;
      if (kept === 1) fHi /= 2;
      kept = 1;
    } else {
      hi = x;
      fHi = fx;
      if (kept === -1) fLo /= 2;
      kept = -1;
    }
  }
  return x;
}
