import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { metaContent } from '../../tools/head.ts';
import { ROOT } from '../../tools/og/inputs.ts';

// The production build as Cloudflare Pages runs it once the maintainer has
// set SITE_URL. The e2e tests serve a local build, which knows no address, so
// this is what proves vite.config.ts wires the head's URLs to the
// environment (decision 42).

describe('a build with SITE_URL set', () => {
  let outDir = '';
  let html = '';
  const saved = { SITE_URL: process.env.SITE_URL, CF_PAGES_URL: process.env.CF_PAGES_URL };
  const restore = (key: 'SITE_URL' | 'CF_PAGES_URL', value: string | undefined) => {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  };

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'spring-drive-build-'));
    process.env.SITE_URL = 'https://example.org/';
    process.env.CF_PAGES_URL = 'https://abc123.spring-drive.pages.dev';
    try {
      await build({
        root: ROOT,
        configFile: join(ROOT, 'vite.config.ts'),
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true },
      });
    } finally {
      restore('SITE_URL', saved.SITE_URL);
      restore('CF_PAGES_URL', saved.CF_PAGES_URL);
    }
    html = readFileSync(join(outDir, 'index.html'), 'utf8');
  }, 60_000);

  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it('names the site, not the deployment, as the page and its image', () => {
    expect(metaContent(html, 'og:url')).toBe('https://example.org/');
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/example\.org\/"\s*\/>/);
    expect(metaContent(html, 'og:image')).toBe('https://example.org/og-image.png');
    expect(html).not.toContain('pages.dev');
  });

  it('strips Vite’s own attribute from the page’s URL tags', () => {
    // The head's comment may mention it; no tag may carry it.
    expect(html).not.toMatch(/<[a-z][^>]*\svite-ignore/);
  });

  it('copies the icons and the card into the output, at the paths the head names', () => {
    for (const file of ['favicon.svg', 'apple-touch-icon.png', 'og-image.png']) {
      expect(readFileSync(join(outDir, file)).length).toBeGreaterThan(0);
    }
  });
});
