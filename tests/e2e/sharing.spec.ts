import { THEMES, parseHex, type Scheme } from '../../src/runtime/palette.ts';
import { colours } from '../../src/widgets/shared/colours.ts';
import { expect, test } from './fixtures.ts';

// What another site sees of the page: its title and description, the card a
// shared link shows, and its icons, served from the production build
// (decision 42). The build here knows no address, so the image URL is
// relative; tests/tools/build.test.ts covers a build that knows one.

async function head(page: import('@playwright/test').Page, key: string): Promise<string | null> {
  return page.locator(`head meta[property="${key}"], head meta[name="${key}"]`).getAttribute('content');
}

/** An image's natural size, loaded into the page as a reader's browser would load it. */
async function naturalSize(page: import('@playwright/test').Page, src: string) {
  return page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  }, src);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shares under the page’s own title and description', async ({ page }) => {
  expect(await head(page, 'og:title')).toBe(await page.title());
  expect(await head(page, 'og:description')).toBe(await head(page, 'description'));
  expect(await head(page, 'twitter:card')).toBe('summary_large_image');
});

test('serves the share card at the size the head declares', async ({ page, request }) => {
  const src = await head(page, 'og:image');
  expect(src).toBe('/og-image.png');
  const response = await request.get(src ?? '');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
  expect(await naturalSize(page, src ?? '')).toEqual({
    width: Number(await head(page, 'og:image:width')),
    height: Number(await head(page, 'og:image:height')),
  });
});

test('serves the home-screen icon as a 180 px PNG', async ({ page, request }) => {
  const href = await page.locator('head link[rel="apple-touch-icon"]').getAttribute('href');
  const response = await request.get(href ?? '');
  expect(response.headers()['content-type']).toBe('image/png');
  expect(await naturalSize(page, href ?? '')).toEqual({ width: 180, height: 180 });
});

test('serves /favicon.ico to whatever asks for it by name rather than reading the head', async ({ request }) => {
  // A browser showing a bare image asks for it, as do some crawlers; a 404
  // there was the M0 placeholder's reason to exist.
  const response = await request.get('/favicon.ico');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/icon/);
});

for (const scheme of ['light', 'dark'] as const satisfies readonly Scheme[]) {
  test(`draws the favicon in the palette’s ${scheme} colours when the reader’s scheme is ${scheme}`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const href = await page.locator('head link[rel="icon"]').getAttribute('href');
    expect(href).toBe('/favicon.svg');
    expect((await request.get(href ?? '')).headers()['content-type']).toMatch(/^image\/svg\+xml/);

    // The icon drawn at 64 px, sampled inside its filled north pole (up and
    // right of centre) and its open south pole (down and left).
    const [north, south] = await page.evaluate(async (url) => {
      const img = new Image(64, 64);
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0, 64, 64);
      const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
      return [at(44, 20), at(20, 44)];
    }, href ?? '');
    // Two levels either way allows for the browser's colour conversion; the
    // two schemes' colours differ by far more than that.
    const near = (actual: number[] | undefined, hex: string) =>
      parseHex(hex).forEach((c, i) => expect(Math.abs((actual?.[i] ?? -99) - c)).toBeLessThanOrEqual(2));
    near(north, colours(THEMES[scheme]).glideWheel);
    near(south, THEMES[scheme].ui.background);
  });
}

test('screenshots the share card and the icons for review', async ({ page, snap }) => {
  await page.goto('/og-image.png');
  await snap(page, 'sharing-card');
  // The favicon at the sizes a tab, a bookmark, and a high-density tab draw
  // it, beside the home-screen icon, in both schemes. Back on the page first:
  // an image document cannot take new content, and relative URLs need the
  // page's origin.
  await page.goto('/');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setContent(
      `<body style="margin:16px;display:flex;gap:16px;align-items:end;background:${THEMES[scheme].ui.surface}">` +
        [16, 32, 64].map((px) => `<img src="/favicon.svg" width="${px}" height="${px}">`).join('') +
        '<img src="/apple-touch-icon.png" width="180" height="180" style="border-radius:40px"></body>',
    );
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
    await snap(page, `sharing-icons-${scheme}`);
  }
});
