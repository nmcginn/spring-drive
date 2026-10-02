import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../src/runtime/palette.ts';
import { DEFAULT_PARAMS } from '../../src/sim/params.ts';
import { colours } from '../../src/widgets/shared/colours.ts';
import {
  absolutizeSharingUrls,
  faviconSvg,
  icoFromPngs,
  metaContent,
  pageTitle,
  siteOrigins,
} from '../../tools/head.ts';
import { FAVICON } from '../../tools/og/inputs.ts';
import { icoEntries } from '../harness/png.ts';
import { INDEX_HTML } from '../prose.ts';

// The page's head as other sites read it: the favicon, and the absolute URLs
// a link preview needs (decision 42).

describe('faviconSvg', () => {
  const svg = faviconSvg(THEMES);

  it('draws the glide wheel in its own colour on the page background, in each scheme', () => {
    const [light, dark] = svg.split('@media (prefers-color-scheme: dark)');
    expect(light).toContain(`.wheel{fill:${colours(THEMES.light).glideWheel}}`);
    expect(light).toContain(`.bg{fill:${THEMES.light.ui.background}}`);
    expect(dark).toContain(`.wheel{fill:${colours(THEMES.dark).glideWheel}}`);
    expect(dark).toContain(`.bg{fill:${THEMES.dark.ui.background}}`);
  });

  it('fills one sector for each of the model’s north poles, as the widgets draw the magnet', () => {
    const pole = /<path class="wheel" d="([^"]+)"\/>/.exec(svg)?.[1] ?? '';
    expect(pole.match(/M/g)).toHaveLength(DEFAULT_PARAMS.generatorPolePairs);
  });

  it('follows the palette: a changed token changes the icon', () => {
    const recoloured = { ...THEMES, dark: { ...THEMES.dark, ui: { ...THEMES.dark.ui, background: '#000001' } } };
    expect(faviconSvg(recoloured)).toContain('.bg{fill:#000001}');
  });

  it('is what public/favicon.svg holds, so the served icon is the palette’s current one', () => {
    // If this fails, run `npm run og-image`.
    expect(readFileSync(FAVICON, 'utf8')).toBe(svg);
  });

  it('is a standalone SVG with no other origin in it beyond its namespace', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.match(/https?:\/\//g)).toEqual(['http://']);
  });
});

describe('siteOrigins', () => {
  it('knows nothing when neither variable is set, as in a local build', () => {
    expect(siteOrigins({})).toEqual({});
    expect(siteOrigins({ SITE_URL: '', CF_PAGES_URL: '  ' })).toEqual({});
  });

  it('reads the site from SITE_URL and this deployment from CF_PAGES_URL', () => {
    expect(
      siteOrigins({ SITE_URL: 'https://example.org', CF_PAGES_URL: 'https://abc123.spring-drive.pages.dev' }),
    ).toEqual({ site: 'https://example.org', deployment: 'https://abc123.spring-drive.pages.dev' });
  });

  it('drops a trailing slash, since every URL in the head begins with one', () => {
    expect(siteOrigins({ SITE_URL: 'https://example.org/' }).site).toBe('https://example.org');
    expect(siteOrigins({ SITE_URL: ' https://example.org ' }).site).toBe('https://example.org');
  });

  it('refuses an address with a path, since the build serves its images from the root', () => {
    expect(() => siteOrigins({ SITE_URL: 'https://example.org/watches/' })).toThrow("SITE_URL must be the site's root");
    expect(() => siteOrigins({ SITE_URL: 'https://example.org/?ref=1' })).toThrow("SITE_URL must be the site's root");
  });

  it('fails the build on a value that is not an absolute http(s) URL, rather than shipping broken previews', () => {
    expect(() => siteOrigins({ SITE_URL: 'example.org' })).toThrow('SITE_URL must be an absolute http(s) URL');
    expect(() => siteOrigins({ SITE_URL: 'ftp://example.org' })).toThrow('SITE_URL');
    expect(() => siteOrigins({ CF_PAGES_URL: '/relative' })).toThrow('CF_PAGES_URL');
  });
});

describe('absolutizeSharingUrls', () => {
  const image = (html: string) => metaContent(html, 'og:image');
  const pageUrls = (html: string) => [
    metaContent(html, 'og:url'),
    /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1],
  ];

  it('leaves the image relative and the page’s own URL out when the build knows no address', () => {
    const out = absolutizeSharingUrls(INDEX_HTML, {});
    expect(image(out)).toBe('/og-image.png');
    expect(pageUrls(out)).toEqual([undefined, undefined]);
  });

  it('points the image at this deployment on a preview, but never names a preview as the page', () => {
    const out = absolutizeSharingUrls(INDEX_HTML, { deployment: 'https://abc123.spring-drive.pages.dev' });
    expect(image(out)).toBe('https://abc123.spring-drive.pages.dev/og-image.png');
    expect(pageUrls(out)).toEqual([undefined, undefined]);
  });

  it('names the site everywhere once SITE_URL is set, even on a Cloudflare build that also knows its deployment', () => {
    const out = absolutizeSharingUrls(INDEX_HTML, {
      site: 'https://example.org',
      deployment: 'https://abc123.spring-drive.pages.dev',
    });
    expect(image(out)).toBe('https://example.org/og-image.png');
    expect(pageUrls(out)).toEqual(['https://example.org/', 'https://example.org/']);
    expect(out).not.toContain('pages.dev');
  });

  it('leaves no relative sharing URL behind when the site is known', () => {
    const out = absolutizeSharingUrls(INDEX_HTML, { site: 'https://example.org' });
    const sharing = [...out.matchAll(/<(?:meta property="og:(?:url|image)"|link rel="canonical")[^>]*>/g)].map(
      (m) => m[0],
    );
    expect(sharing).toHaveLength(3);
    for (const tag of sharing) expect(tag).toMatch(/"https:\/\/example\.org\//);
  });

  it('removes the page’s URL tags whole, without leaving blank lines in the head', () => {
    const out = absolutizeSharingUrls(INDEX_HTML, {});
    expect(out).not.toContain('og:url');
    expect(out).not.toContain('rel="canonical"');
    expect(out).not.toMatch(/\n[ \t]*\n[ \t]*<meta property="og:image"/);
    expect(INDEX_HTML.split('\n').length - out.split('\n').length).toBe(2);
  });

  it('changes nothing else in the page', () => {
    const out = absolutizeSharingUrls(INDEX_HTML, { site: 'https://example.org' });
    const strip = (html: string) =>
      html
        .replace(/<(?:meta property="og:(?:url|image)"|link rel="canonical")[^>]*>/g, '')
        .replace(/ vite-ignore/g, '');
    expect(strip(out)).toBe(strip(INDEX_HTML));
  });
});

describe('reading the head', () => {
  it('reads a title and a meta tag, whether its content is on the same line or wrapped onto its own', () => {
    const html = `<title> A &amp; B </title><meta property="og:title" content="One" />
    <meta
      name="description"
      content="It&#39;s &quot;two&quot;"
    />`;
    expect(pageTitle(html)).toBe('A & B');
    expect(metaContent(html, 'og:title')).toBe('One');
    expect(metaContent(html, 'description')).toBe('It\'s "two"');
    expect(metaContent(html, 'og:image')).toBeUndefined();
  });

  it('matches a key exactly, so og:image is not og:image:alt', () => {
    const html = '<meta property="og:image:alt" content="words" /><meta property="og:image" content="/a.png" />';
    expect(metaContent(html, 'og:image')).toBe('/a.png');
    expect(metaContent(html, 'og:image:alt')).toBe('words');
  });
});

describe('icoFromPngs', () => {
  const fake = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + n) % 256);

  it('lists each image with its size, and points each entry at that image’s bytes', () => {
    const images = [
      { sizePx: 16, png: fake(5) },
      { sizePx: 32, png: fake(9) },
      { sizePx: 48, png: fake(3) },
    ];
    const ico = icoFromPngs(images);
    expect(ico.length).toBe(6 + 16 * 3 + 5 + 9 + 3);
    expect(icoEntries(ico)).toEqual(images);
  });

  it('writes 256 px as 0, as the one-byte field requires, and refuses sizes the format cannot hold', () => {
    expect(icoEntries(icoFromPngs([{ sizePx: 256, png: fake(2) }]))[0]?.sizePx).toBe(256);
    expect(icoFromPngs([{ sizePx: 256, png: fake(2) }])[6]).toBe(0);
    expect(() => icoFromPngs([{ sizePx: 257, png: fake(2) }])).toThrow('1 to 256 px');
    expect(() => icoFromPngs([{ sizePx: 0, png: fake(2) }])).toThrow('1 to 256 px');
    expect(() => icoFromPngs([{ sizePx: 15.5, png: fake(2) }])).toThrow('1 to 256 px');
  });
});
