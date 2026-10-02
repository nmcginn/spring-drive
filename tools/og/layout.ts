// Where everything on the share card goes. Pure, so the card's geometry is
// tested under Node (tests/tools/og.test.ts); tools/og/card.ts only draws.

/**
 * The card's size: 1.91:1 at 1,200 px wide, the size Facebook, LinkedIn,
 * Slack, and X's large card all show without cropping.
 */
export const CARD_WIDTH_PX = 1200;
export const CARD_HEIGHT_PX = 630;

/** The home-screen icon iOS asks for on current iPhones; it scales it down for older ones. */
export const TOUCH_ICON_PX = 180;

/** Clear space around everything, so a preview that rounds or insets the card clips nothing. */
export const CARD_MARGIN_PX = 64;

export const TITLE_FONT_PX = 96;
export const DESCRIPTION_FONT_PX = 40;
const DESCRIPTION_LINE_HEIGHT = 1.3;
/** Between the title's baseline and the description's first line. */
const TITLE_GAP_PX = 36;

/** The text column stops here, short of the dial. */
const TEXT_RIGHT_PX = 640;
const DIAL_RADIUS_PX = 236;

/**
 * The glide wheel and coil are drawn by the widgets' own functions, at the
 * size the generator widget draws them, then scaled up, so their labels are
 * still legible when a preview shrinks the card to a third of its width.
 */
export const WHEEL_SCALE = 1.7;
const WHEEL_RADIUS = 36;
/** The coil above the wheel, as the generator widget places it, as fractions of the wheel radius. */
const COIL_WIDTH = 0.9;
const COIL_HEIGHT = 0.5;
const COIL_GAP = 0.14;
/** Room under the wheel for its name, and right of the coil for its own, before scaling. */
const WHEEL_LABEL = 20;
const COIL_LABEL = 34;

/**
 * The time the card's dial shows: 10:08:37. Hands near ten past ten frame
 * the dial's centre, as watch photographs do, and leave the seconds hand
 * clear of both.
 */
export const CARD_SHOWN_S = 10 * 3600 + 8 * 60 + 37;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardLayout {
  /** Left edge and baseline of the title. */
  title: { x: number; baseline: number };
  /** Left edge and baseline of each description line. */
  description: { x: number; baselines: number[] };
  /** The space the text may take: the wrapping width and the block's extent. */
  text: Box;
  dial: { cx: number; cy: number; radius: number };
  /** Where the wheel group is drawn from, and how much it is scaled: drawn in its own units, then scaled about this origin. */
  wheelGroup: { originX: number; originY: number; scale: number };
  /** The wheel and coil, in the group's own units. */
  wheel: { cx: number; cy: number; radius: number };
  coil: Box;
  /** The whole wheel group, labels included, in card pixels. */
  wheelBounds: Box;
}

export const TEXT_WIDTH_PX = TEXT_RIGHT_PX - CARD_MARGIN_PX;

/** The card, for a description wrapped to `descriptionLines` lines. */
export function cardLayout(descriptionLines: number): CardLayout {
  const x = CARD_MARGIN_PX;
  const titleBaseline = CARD_MARGIN_PX + TITLE_FONT_PX * 0.8;
  const lineStep = DESCRIPTION_FONT_PX * DESCRIPTION_LINE_HEIGHT;
  const firstLine = titleBaseline + TITLE_GAP_PX + DESCRIPTION_FONT_PX;
  const baselines = Array.from({ length: descriptionLines }, (_, i) => firstLine + i * lineStep);
  const textBottom = (baselines.at(-1) ?? titleBaseline) + DESCRIPTION_FONT_PX * 0.3;

  // The wheel group sits in the bottom left corner, under the text.
  const coilHeight = WHEEL_RADIUS * COIL_HEIGHT;
  const coilWidth = WHEEL_RADIUS * COIL_WIDTH;
  const groupWidth = Math.max(2 * WHEEL_RADIUS, WHEEL_RADIUS + coilWidth / 2 + 6 + COIL_LABEL);
  const groupHeight = coilHeight + WHEEL_RADIUS * COIL_GAP + 2 * WHEEL_RADIUS + WHEEL_LABEL;
  const scale = WHEEL_SCALE;
  const originX = x;
  const originY = CARD_HEIGHT_PX - CARD_MARGIN_PX - groupHeight * scale;
  const wheelCy = coilHeight + WHEEL_RADIUS * COIL_GAP + WHEEL_RADIUS;

  return {
    title: { x, baseline: titleBaseline },
    description: { x, baselines },
    text: { x, y: CARD_MARGIN_PX, width: TEXT_WIDTH_PX, height: textBottom - CARD_MARGIN_PX },
    dial: { cx: CARD_WIDTH_PX - CARD_MARGIN_PX - DIAL_RADIUS_PX, cy: CARD_HEIGHT_PX / 2, radius: DIAL_RADIUS_PX },
    wheelGroup: { originX, originY, scale },
    wheel: { cx: WHEEL_RADIUS, cy: wheelCy, radius: WHEEL_RADIUS },
    coil: { x: WHEEL_RADIUS - coilWidth / 2, y: 0, width: coilWidth, height: coilHeight },
    wheelBounds: { x: originX, y: originY, width: groupWidth * scale, height: groupHeight * scale },
  };
}

/**
 * `text` broken into lines no wider than `maxWidthPx`, greedily, at spaces.
 * A single word wider than the line gets a line to itself rather than being
 * split, so `fits` below is what catches a description too long for the card.
 */
export function wrapLines(text: string, maxWidthPx: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/)) {
    if (word === '') continue;
    const candidate = line === '' ? word : `${line} ${word}`;
    if (line !== '' && measure(candidate) > maxWidthPx) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** Whether `b` lies wholly inside `a`. */
export function contains(a: Box, b: Box): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
}

/** Whether two boxes share any area. */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The card less its margin: everything drawn stays inside it. */
export const SAFE_AREA: Box = {
  x: CARD_MARGIN_PX,
  y: CARD_MARGIN_PX,
  width: CARD_WIDTH_PX - 2 * CARD_MARGIN_PX,
  height: CARD_HEIGHT_PX - 2 * CARD_MARGIN_PX,
};

/** The dial's bounding square. */
export function dialBounds(l: CardLayout): Box {
  const { cx, cy, radius } = l.dial;
  return { x: cx - radius, y: cy - radius, width: 2 * radius, height: 2 * radius };
}

/**
 * Whether a layout is drawable: every part inside the safe area, and no two
 * of the text, the wheel group, and the dial overlapping. The card refuses
 * to draw a layout that fails this, so a longer description in index.html
 * breaks the render rather than shipping a card with text under the dial.
 */
export function fits(l: CardLayout): boolean {
  const parts = [l.text, l.wheelBounds, dialBounds(l)];
  if (!parts.every((p) => contains(SAFE_AREA, p))) return false;
  return (
    !overlaps(l.text, l.wheelBounds) && !overlaps(l.text, dialBounds(l)) && !overlaps(l.wheelBounds, dialBounds(l))
  );
}
