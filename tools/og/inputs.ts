// What the rendered images in public/ are drawn from, and a digest of it.
// tools/og/render.ts records the digest when it draws them, and
// tests/tools/og.test.ts fails when the digest no longer matches, so a change
// to the palette, the drawing, or the article's title cannot leave a stale
// share card behind (decision 42).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { metaContent } from '../head.ts';

export const ROOT = join(import.meta.dirname, '..', '..');

/** Where the rendered files go, and the record of what they were drawn from. */
export const OG_IMAGE = join(ROOT, 'public', 'og-image.png');
export const TOUCH_ICON = join(ROOT, 'public', 'apple-touch-icon.png');
export const FAVICON = join(ROOT, 'public', 'favicon.svg');
export const FAVICON_ICO = join(ROOT, 'public', 'favicon.ico');
/** The sizes in favicon.ico: a tab, a high-density tab, and a desktop shortcut. */
export const ICO_SIZES_PX = [16, 32, 48] as const;
export const RENDERED = join(ROOT, 'tools', 'og', 'rendered.json');

/**
 * Every source file the images depend on. Deliberately broad: a refactor of
 * draw.ts that changes nothing on the card still asks for a re-render, which
 * is one command, where a narrow list would let a real change through.
 */
export const RENDER_SOURCES = [
  'tools/og/card.html',
  'tools/og/card.ts',
  'tools/og/layout.ts',
  'tools/og/render.ts',
  'tools/head.ts',
  'src/runtime/palette.ts',
  'src/sim/params.ts',
  'src/widgets/shared/colours.ts',
  'src/widgets/shared/dial.ts',
  'src/widgets/shared/draw.ts',
  'src/widgets/shared/magnet.ts',
  'src/widgets/shared/motion.ts',
] as const;

/** The digest of every input, under `root`. */
export function renderDigest(root: string = ROOT): string {
  const hash = createHash('sha256');
  for (const file of RENDER_SOURCES) {
    hash.update(`${file}\0`);
    // Line endings are normalised, so a Windows checkout agrees with CI.
    hash.update(readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n'));
    hash.update('\0');
  }
  // Of index.html, only the words the card draws: editing the prose stubs
  // must not ask for a re-render.
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  hash.update(`og:title\0${metaContent(html, 'og:title') ?? ''}\0`);
  hash.update(`og:description\0${metaContent(html, 'og:description') ?? ''}\0`);
  // The typeface the card's words are set in.
  const jost = JSON.parse(readFileSync(join(root, 'node_modules', '@fontsource', 'jost', 'package.json'), 'utf8')) as {
    version: string;
  };
  hash.update(`@fontsource/jost\0${jost.version}\0`);
  return hash.digest('hex');
}
