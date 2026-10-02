// `npm run og-image`: draws the share card, the home-screen icon, and
// favicon.ico in Chromium, writes them and favicon.svg to public/, and
// records what they were drawn from (decision 42). Run it after changing
// anything in RENDER_SOURCES; tests/tools/og.test.ts says when.

import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { THEMES } from '../../src/runtime/palette.ts';
import { faviconSvg, icoFromPngs } from '../head.ts';
import { FAVICON, FAVICON_ICO, ICO_SIZES_PX, OG_IMAGE, RENDERED, ROOT, TOUCH_ICON, renderDigest } from './inputs.ts';
import { CARD_HEIGHT_PX, CARD_WIDTH_PX, TOUCH_ICON_PX } from './layout.ts';

async function main(): Promise<void> {
  const favicon = faviconSvg(THEMES);
  writeFileSync(FAVICON, favicon);

  // The card page is served by Vite for its TypeScript and fonts, without
  // vite.config.ts, whose plugins are for index.html.
  const server = await createServer({ root: ROOT, configFile: false, logLevel: 'warn', server: { port: 5199 } });
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  // Cloud sessions use their preinstalled Chromium (decision 11).
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    if (!base) throw new Error('Vite did not report its address');
    const card = await browser.newPage({
      viewport: { width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    await card.goto(new URL('tools/og/card.html', base).href);
    await card.waitForFunction(() => document.body.dataset.ready === 'true' || document.body.dataset.error);
    const error = await card.evaluate(() => document.body.dataset.error);
    if (error) throw new Error(`The card did not draw: ${error}`);
    await card.locator('canvas').screenshot({ path: OG_IMAGE });

    // iOS shows a transparent icon on black and rounds the corners itself,
    // so the icon is the favicon on an opaque square of the page's background.
    const icon = await browser.newPage({
      viewport: { width: TOUCH_ICON_PX, height: TOUCH_ICON_PX },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    const src = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;
    await icon.setContent(
      `<body style="margin:0;background:${THEMES.light.ui.background}"><img src="${src}" width="${TOUCH_ICON_PX}" height="${TOUCH_ICON_PX}" style="display:block"></body>`,
    );
    await icon.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    await icon.screenshot({ path: TOUCH_ICON });

    // /favicon.ico: the same icon, transparent around the wheel as the SVG
    // is, at the sizes a tab and a bookmark draw it.
    const pngs = [];
    for (const sizePx of ICO_SIZES_PX) {
      const tab = await browser.newPage({ viewport: { width: sizePx, height: sizePx }, colorScheme: 'light' });
      await tab.setContent(
        `<body style="margin:0"><img src="${src}" width="${sizePx}" height="${sizePx}" style="display:block"></body>`,
      );
      await tab.locator('img').evaluate((img: HTMLImageElement) => img.decode());
      pngs.push({ sizePx, png: await tab.screenshot({ omitBackground: true }) });
    }
    writeFileSync(FAVICON_ICO, icoFromPngs(pngs));
  } finally {
    await browser.close();
    await server.close();
  }

  writeFileSync(RENDERED, `${JSON.stringify({ digest: renderDigest() }, null, 2)}\n`);
  console.log(
    'Wrote public/og-image.png, apple-touch-icon.png, favicon.svg, and favicon.ico, and tools/og/rendered.json',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
