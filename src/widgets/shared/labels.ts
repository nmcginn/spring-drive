// Placing text labels along a line so none overlaps another. Pure, so the
// rule is tested once (tests/widgets/labels.test.ts).

/**
 * Where to write each label along a line, beside its anchor at `x`: to the
 * right if there is room, else to the left. Labels are placed in the order
 * given, which is their priority, and a label that would overlap one already
 * placed, on either side, or run past `minX` or `maxX`, is left off (null).
 * The lenz-brake widget names each run beside where it stopped, the current
 * run first; the loop widget names each event on its scope, newest first.
 */
export function placeLabels(
  labels: readonly { x: number; width: number }[],
  minX: number,
  maxX: number,
  gapPx = 4,
): ({ from: number; to: number } | null)[] {
  const placed: { from: number; to: number }[] = [];
  const clear = (span: { from: number; to: number }) =>
    span.from >= minX && span.to <= maxX && placed.every((o) => span.to + gapPx <= o.from || span.from >= o.to + gapPx);
  return labels.map(({ x, width }) => {
    const right = { from: x + gapPx, to: x + gapPx + width };
    const left = { from: x - gapPx - width, to: x - gapPx };
    const span = [right, left].find(clear) ?? null;
    if (span) placed.push(span);
    return span;
  });
}
