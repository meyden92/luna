import type { Page } from '@playwright/test';

const cores = new Map<string, Buffer>();

/**
 * Lets ffmpeg.wasm load its core from the CDN in a test browser. Every test context sends a `cf-connecting-ip`
 * header (see `fixtures/users.ts`), and the CDN's Cloudflare answers a request carrying a made-up one with a 403
 * page, which Chromium reports as a CORS failure, so the editor's "Loading FFmpeg" step never ends. The core is
 * fetched from the test side instead (once per worker, no such header) and served with the CORS header the page
 * needs. Call before `goto`.
 */
export async function serveFfmpegCore(page: Page): Promise<void> {
  await page.route('https://unpkg.com/@ffmpeg/**', async (route) => {
    const url = route.request().url();
    let body = cores.get(url);
    if (!body) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`The ffmpeg core ${url} answered ${response.status}`);
      body = Buffer.from(await response.arrayBuffer());
      cores.set(url, body);
    }
    // The page turns these into blob URLs and the worker imports the script from one, which needs a JavaScript type.
    const contentType = url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
    await route.fulfill({ status: 200, body, contentType, headers: { 'access-control-allow-origin': '*' } });
  });
}
