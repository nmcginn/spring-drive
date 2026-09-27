// The glide wheel's magnet, as the generator and the brake widgets draw it.
// Pure geometry, so the rules are tested once (tests/widgets/magnet.test.ts).

import { TAU } from '../../sim/units.ts';

/**
 * The magnet's poles as sectors: 2p of them, alternating north and south,
 * each spanning π/p, with a north pole centred on `angleRad`. Angles are
 * clockwise from 12 o'clock, where the coil is, as on a dial.
 */
export function poleSectors(angleRad: number, polePairs: number): { fromRad: number; toRad: number; north: boolean }[] {
  const pitch = Math.PI / polePairs;
  return Array.from({ length: 2 * polePairs }, (_, k) => {
    const centre = angleRad + k * pitch;
    return { fromRad: centre - pitch / 2, toRad: centre + pitch / 2, north: k % 2 === 0 };
  });
}

/**
 * Beyond this turn a frame, N and S letters on the magnet would jump too far
 * between frames to read: 14°, which slow motion stays under all the way to
 * the generator's top speed (16 rev/s at an eighth is 12° a frame at 60 Hz).
 * At real time, even 8 rev/s is 48° a frame, and the letters are left off.
 */
export const POLE_LETTERS_MAX_SWEEP_RAD = 0.25;

export function poleLettersVisible(sweepRad: number): boolean {
  return Math.abs(sweepRad) <= POLE_LETTERS_MAX_SWEEP_RAD;
}

/** The angle over which the magnet's drawing repeats: one pole pair. */
export function poleRepeatRad(polePairs: number): number {
  return TAU / polePairs;
}
