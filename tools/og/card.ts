// The share card: what a link to the article shows in a chat or a feed. It
// is drawn here, in a browser, by the widgets' own drawing functions and in
// the palette's light tokens, and tools/og/render.ts screenshots it into
// public/og-image.png (decision 42). Its words are index.html's own Open
// Graph title and description, so the card and the preview's text agree.

import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/latin-600.css';
import indexHtml from '../../index.html?raw';
import { THEMES } from '../../src/runtime/palette.ts';
import { DEFAULT_PARAMS } from '../../src/sim/params.ts';
import { colours } from '../../src/widgets/shared/colours.ts';
import { handAngles } from '../../src/widgets/shared/dial.ts';
import { drawArbor, drawCoil, drawDialFace, drawHand, drawMagnet, labelFont } from '../../src/widgets/shared/draw.ts';
import { metaContent } from '../head.ts';
import {
  CARD_HEIGHT_PX,
  CARD_SHOWN_S,
  CARD_WIDTH_PX,
  DESCRIPTION_FONT_PX,
  TEXT_WIDTH_PX,
  TITLE_FONT_PX,
  cardLayout,
  fits,
  wrapLines,
} from './layout.ts';

// One image serves every reader, and most previews sit on a light page, so
// the card uses the light scheme.
const t = THEMES.light;

async function main(): Promise<void> {
  const title = metaContent(indexHtml, 'og:title');
  const description = metaContent(indexHtml, 'og:description');
  if (!title || !description) throw new Error('index.html needs og:title and og:description for the card');

  const titleFont = labelFont(TITLE_FONT_PX, 600);
  const descriptionFont = labelFont(DESCRIPTION_FONT_PX, 400);
  // Measuring before Jost has loaded would wrap the text for the fallback face.
  await Promise.all([
    document.fonts.load(titleFont),
    document.fonts.load(descriptionFont),
    document.fonts.load(labelFont(13, 600)),
  ]);

  const canvas = document.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) throw new Error('The card page has no canvas');
  canvas.width = CARD_WIDTH_PX;
  canvas.height = CARD_HEIGHT_PX;

  ctx.font = descriptionFont;
  const lines = wrapLines(description, TEXT_WIDTH_PX, (s) => ctx.measureText(s).width);
  const layout = cardLayout(lines.length);
  ctx.font = titleFont;
  const titleWidthPx = ctx.measureText(title).width;
  if (!fits(layout) || titleWidthPx > layout.text.width) {
    throw new Error(
      `The title (${Math.round(titleWidthPx)} px wide) and description (${lines.length} lines) no longer fit the card. ` +
        'Shorten them, or change tools/og/layout.ts.',
    );
  }

  ctx.fillStyle = t.ui.background;
  ctx.fillRect(0, 0, CARD_WIDTH_PX, CARD_HEIGHT_PX);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.ui.text;
  ctx.font = titleFont;
  ctx.fillText(title, layout.title.x, layout.title.baseline);
  ctx.fillStyle = t.ui.muted;
  ctx.font = descriptionFont;
  lines.forEach((line, i) => ctx.fillText(line, layout.description.x, layout.description.baselines[i] ?? 0));

  // The dial, its hands in the hands' colour, as the intro's Spring Drive.
  const { cx, cy, radius } = layout.dial;
  const hands = handAngles(CARD_SHOWN_S);
  const hand = colours(t).hands;
  drawDialFace(ctx, cx, cy, radius, t);
  drawHand(ctx, cx, cy, radius, hands.hourRad, { colour: hand, widthPx: 10, length: 0.5, tail: 0.1 });
  drawHand(ctx, cx, cy, radius, hands.minuteRad, { colour: hand, widthPx: 7, length: 0.78, tail: 0.1 });
  drawHand(ctx, cx, cy, radius, hands.secondRad, { colour: hand, widthPx: 3, length: 0.95, tail: 0.18 });
  drawArbor(ctx, cx, cy, 8, hand);

  // The glide wheel under its coil, as the generator widget draws them,
  // standing still so its poles are lettered.
  const g = layout.wheelGroup;
  ctx.save();
  ctx.translate(g.originX, g.originY);
  ctx.scale(g.scale, g.scale);
  drawCoil(ctx, layout.coil, t);
  drawMagnet(
    ctx,
    layout.wheel,
    { angleRad: Math.PI / 4, sweepRad: 0, polePairs: DEFAULT_PARAMS.generatorPolePairs },
    t,
  );
  ctx.restore();

  document.body.dataset.ready = 'true';
}

main().catch((error: unknown) => {
  document.body.dataset.error = error instanceof Error ? error.message : String(error);
});
