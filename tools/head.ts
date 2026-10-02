// What the page's head tells other sites: the favicon, and the absolute URLs
// a link preview needs. Pure string functions, used at build time by
// vite.config.ts and by tools/og/render.ts, and tested under Node
// (decision 42).

import type { Scheme, Theme } from '../src/runtime/palette.ts';
import { DEFAULT_PARAMS } from '../src/sim/params.ts';
import { colours } from '../src/widgets/shared/colours.ts';
import { polar } from '../src/widgets/shared/dial.ts';
import { poleSectors } from '../src/widgets/shared/magnet.ts';

/** The icon's square, in SVG user units. */
const ICON_SIZE = 64;
const ICON_RADIUS = 27;
const ICON_RIM = 4;
const ICON_ARBOR = 4.5;
/**
 * Where the icon's north pole is centred: half past one, so the split
 * between the poles runs corner to corner and reads as a turning wheel
 * rather than a half-filled circle.
 */
const ICON_NORTH_RAD = Math.PI / 4;

/** Two decimals is far below a pixel at any size a favicon is drawn. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

// The wheel takes its colour as every widget takes it, through the table
// that says which part each drawn thing is (decision 40).
function rules(t: Theme): string {
  const wheel = colours(t).glideWheel;
  return `.bg{fill:${t.ui.background}}.wheel{fill:${wheel}}.rim{fill:none;stroke:${wheel}}`;
}

/**
 * The favicon: the glide wheel's magnet as the widgets draw it, north poles
 * filled and south poles open, in the glide wheel's colour, on the page's
 * background, in the reader's colour scheme. Colours are the palette's
 * tokens and the poles are the model's, so the icon follows both.
 */
export function faviconSvg(themes: Readonly<Record<Scheme, Theme>>): string {
  const c = n(ICON_SIZE / 2);
  const at = (angleRad: number) => polar(ICON_SIZE / 2, ICON_SIZE / 2, ICON_RADIUS, angleRad);
  // A pole spans at most half a turn, so each is the short arc (large-arc
  // flag 0), drawn clockwise (sweep flag 1) as dial angles run.
  const poles = poleSectors(ICON_NORTH_RAD, DEFAULT_PARAMS.generatorPolePairs)
    .filter((s) => s.north)
    .map((s) => {
      const from = at(s.fromRad);
      const to = at(s.toRad);
      return `M${c} ${c}L${n(from.x)} ${n(from.y)}A${ICON_RADIUS} ${ICON_RADIUS} 0 0 1 ${n(to.x)} ${n(to.y)}Z`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">` +
    `<style>${rules(themes.light)}@media (prefers-color-scheme: dark){${rules(themes.dark)}}</style>` +
    `<circle class="bg" cx="${c}" cy="${c}" r="${ICON_RADIUS}"/>` +
    `<path class="wheel" d="${poles}"/>` +
    `<circle class="rim" cx="${c}" cy="${c}" r="${ICON_RADIUS}" stroke-width="${ICON_RIM}"/>` +
    // The arbor, ringed in the background as drawMagnet rings it, so it
    // shows where it sits on the filled pole.
    `<circle class="bg" cx="${c}" cy="${c}" r="${n(ICON_ARBOR + 1.5)}"/>` +
    `<circle class="wheel" cx="${c}" cy="${c}" r="${ICON_ARBOR}"/>` +
    `</svg>\n`
  );
}

/** Where the built site lives, as far as the build can tell. */
export interface SiteOrigins {
  /** The site's public address, set by the maintainer as `SITE_URL`. */
  site?: string;
  /** This deployment's own address, which Cloudflare Pages sets as `CF_PAGES_URL` on every build. */
  deployment?: string;
}

function origin(name: string, value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL, not ${JSON.stringify(value)}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${name} must be an absolute http(s) URL, not ${JSON.stringify(value)}`);
  }
  // The build serves everything from the root (Vite's `base` is "/"), so a
  // path would name images the site does not serve there.
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be the site's root, with no path, not ${JSON.stringify(value)}`);
  }
  return url.origin;
}

/** The origins from the build's environment. A malformed one fails the build rather than shipping broken previews. */
export function siteOrigins(env: Readonly<Record<string, string | undefined>>): SiteOrigins {
  const site = origin('SITE_URL', env.SITE_URL);
  const deployment = origin('CF_PAGES_URL', env.CF_PAGES_URL);
  return { ...(site ? { site } : {}), ...(deployment ? { deployment } : {}) };
}

// Tags whose URL a link preview needs absolute (the Open Graph protocol
// requires it, and crawlers do not resolve a relative one), split by what
// they mean. An image is the same file at any address that serves this
// build. The page's own address is not: a canonical URL or og:url naming a
// preview deployment would tell crawlers the preview is the article.
const IMAGE_TAG = /<meta\s+(?:property="og:image"|name="twitter:image")\s+content="(\/[^"]*)"\s*\/>/g;
// `vite-ignore` keeps Vite from resolving "/" as a file; the build removes
// it, and the dev server leaves it.
const PAGE_TAG =
  /<(?:meta\s+property="og:url"\s+content|link\s+rel="canonical"\s+href)="(\/[^"]*)"(?:\s+vite-ignore)?\s*\/>/g;
const PAGE_TAG_LINE = new RegExp(String.raw`[ \t]*${PAGE_TAG.source}[ \t]*\n?`, 'g');

/**
 * index.html with its sharing URLs made absolute. Images take the site's
 * address, or this deployment's if the site's is not set, or stay relative
 * when the build knows neither (a local build). The page's own URL takes
 * only the site's address, and without one its tags are left out.
 */
export function absolutizeSharingUrls(html: string, origins: SiteOrigins): string {
  const imageOrigin = origins.site ?? origins.deployment;
  let out = html;
  if (imageOrigin)
    out = out.replace(IMAGE_TAG, (tag, path: string) => tag.replace(`"${path}"`, `"${imageOrigin}${path}"`));
  const site = origins.site;
  out = site
    ? out.replace(PAGE_TAG, (tag, path: string) => tag.replace(`"${path}"`, `"${site}${path}"`))
    : out.replace(PAGE_TAG_LINE, '');
  return out;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'" };

function decode(text: string): string {
  return text.replace(/&(amp|quot|apos|lt|gt|#39);/g, (_, name: string) => ENTITIES[name] ?? '');
}

/** The page's `<title>`, as text. */
export function pageTitle(html: string): string | undefined {
  const m = /<title>([^<]*)<\/title>/.exec(html);
  return m?.[1] === undefined ? undefined : decode(m[1].trim());
}

/**
 * The content of the head's `<meta property="…">` (Open Graph) or
 * `<meta name="…">` tag, as text, read the way the tags are written in
 * index.html: the key first, then the content, which may wrap onto its own
 * line as Prettier would leave it.
 */
export function metaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(String.raw`<meta\s+(?:property|name)="${escaped}"\s+content="([^"]*)"`).exec(html);
  return m?.[1] === undefined ? undefined : decode(m[1].replace(/\s+/g, ' ').trim());
}

/**
 * An ICO file holding each PNG as one image, the format every browser since
 * Internet Explorer 9 reads. It is for whatever asks for /favicon.ico by
 * name, without reading the head: a browser showing a bare image, and some
 * crawlers and bookmark services.
 */
export function icoFromPngs(images: readonly { sizePx: number; png: Uint8Array }[]): Uint8Array {
  const HEADER = 6;
  const ENTRY = 16;
  const total = HEADER + ENTRY * images.length + images.reduce((sum, i) => sum + i.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // 1 = icon
  view.setUint16(4, images.length, true);
  let offset = HEADER + ENTRY * images.length;
  images.forEach(({ sizePx, png }, i) => {
    if (!Number.isInteger(sizePx) || sizePx < 1 || sizePx > 256)
      throw new Error(`An ICO image is 1 to 256 px, not ${sizePx}`);
    const entry = HEADER + ENTRY * i;
    // A size of 256 is written as 0, since the field is one byte.
    view.setUint8(entry, sizePx % 256);
    view.setUint8(entry + 1, sizePx % 256);
    view.setUint8(entry + 2, 0); // no palette
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}
