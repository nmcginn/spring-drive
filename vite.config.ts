import { defineConfig, type Plugin } from 'vite';
import { paletteCss } from './src/runtime/palette.ts';
import { absolutizeSharingUrls, siteOrigins } from './tools/head.ts';

// Inlines the palette into index.html's <style id="palette">, so prose part
// colours are right on first paint and come from the same tokens widgets use.
function inlinePalette(): Plugin {
  return {
    name: 'inline-palette',
    transformIndexHtml(html) {
      const tag = '<style id="palette"></style>';
      if (!html.includes(tag)) throw new Error(`index.html is missing ${tag}`);
      return html.replace(tag, `<style id="palette">${paletteCss()}</style>`);
    },
  };
}

// Makes the head's sharing URLs absolute, as link previews need them, from
// SITE_URL or Cloudflare's CF_PAGES_URL (decision 42). Runs last, after Vite
// has dealt with the page's own asset URLs.
function sharingUrls(): Plugin {
  const origins = siteOrigins(process.env);
  return {
    name: 'sharing-urls',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => absolutizeSharingUrls(html, origins),
    },
  };
}

export default defineConfig({
  plugins: [inlinePalette(), sharingUrls()],
  build: {
    target: 'es2022',
    // Fonts must be files in dist, never inlined or fetched: small woff2
    // files would otherwise become data: URIs, which bloats the CSS for
    // every reader.
    assetsInlineLimit: 0,
  },
});
