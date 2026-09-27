import { describe, expect, it } from 'vitest';
import { placeLabels } from '../../src/widgets/shared/labels.ts';

describe('placeLabels', () => {
  it('writes each label beside its anchor, to the right if it fits, else to the left, and never over another', () => {
    const placed = placeLabels(
      [
        { x: 100, width: 40 }, // right of its anchor
        { x: 290, width: 40 }, // no room right: left
        { x: 95, width: 40 }, // right overlaps the first: left
        { x: 100, width: 40 }, // both sides taken: left off
      ],
      0,
      300,
    );
    expect(placed).toEqual([{ from: 104, to: 144 }, { from: 246, to: 286 }, { from: 51, to: 91 }, null]);
  });

  it('leaves off a label with no room on either side of the bounds', () => {
    expect(placeLabels([{ x: 20, width: 40 }], 10, 50)).toEqual([null]);
  });
});
