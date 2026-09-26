// Motion blur for anything drawn turning faster than the frame rate can
// follow: the runaway's spoked wheel, the generator's magnet. Pure, so the
// rule is tested once (tests/widgets/motion.test.ts).

/** Below this sweep a frame is drawn sharp. About 3°, a pixel at the rim of a 20 px wheel. */
const SHARP_SWEEP_RAD = 0.05;
const MAX_BLUR_COPIES = 12;

export interface Blur {
  /** How many copies of the pattern to draw, trailing back from the current angle. */
  copies: number;
  /** Angle between copies, rad. */
  stepRad: number;
  /** Opacity of each copy. */
  alpha: number;
}

/**
 * Motion blur for a wheel that turned `sweepRad` in a frame, drawn with a
 * pattern that repeats every `repeatRad` (a spoke spacing, or a magnet's
 * pole pitch). The pattern is drawn at several angles across the sweep, each
 * faint, as a camera's exposure would record it. Past one repeat the smear
 * would only draw over itself, so it never spans more than that: a wheel at
 * 30 rev/s is a uniform blur, which is what it looks like, rather than the
 * backwards-turning wagon wheel that a sharp drawing at 60 frames a second
 * would show.
 */
export function blur(sweepRad: number, repeatRad: number): Blur {
  const spanRad = Math.min(Math.abs(sweepRad), repeatRad);
  if (!(spanRad >= SHARP_SWEEP_RAD)) return { copies: 1, stepRad: 0, alpha: 1 };
  const copies = Math.min(MAX_BLUR_COPIES, Math.ceil(spanRad / SHARP_SWEEP_RAD) + 1);
  // Overlapping copies add up, so each is fainter the more there are, but
  // never so faint that the smear disappears against the surface.
  return { copies, stepRad: spanRad / (copies - 1), alpha: Math.max(0.2, 1.5 / copies) };
}
