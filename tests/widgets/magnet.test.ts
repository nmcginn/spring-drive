import { describe, expect, it } from 'vitest';
import { TAU, revSToRadS } from '../../src/sim/units.ts';
import { poleLettersVisible, poleRepeatRad, poleSectors } from '../../src/widgets/shared/magnet.ts';

const FRAME_S = 1 / 60;

describe('the glide wheel’s magnet', () => {
  it('draws one north and one south pole, with the north centred on the wheel’s angle', () => {
    const [n, s] = poleSectors(0, 1);
    expect(n).toEqual({ fromRad: -Math.PI / 2, toRad: Math.PI / 2, north: true });
    expect(s!.north).toBe(false);
    expect(poleSectors(0, 2)).toHaveLength(4);
    expect(poleRepeatRad(1)).toBe(TAU);
  });

  it('letters the poles in a static frame and in slow motion up to 16 rev/s, but not at 8 rev/s in real time', () => {
    expect(poleLettersVisible(0)).toBe(true);
    // 16 rev/s at an eighth of real time, one 60 Hz frame: 12°.
    expect(poleLettersVisible((revSToRadS(16) * FRAME_S) / 8)).toBe(true);
    // 8 rev/s in real time: 48° a frame.
    expect(poleLettersVisible(revSToRadS(8) * FRAME_S)).toBe(false);
  });
});
