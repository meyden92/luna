import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import './start';

const handler = createStartHandler(defaultStreamHandler);

// Static-asset URLs (.js/.css/fonts/images). Existing files are served by Nitro as
// their real content type; only a *missing* file falls through to the SSR catch-all,
// which answers 200 with the HTML document. We detect that case by the response being
// `text/html` for an asset-extension path, so real assets are never affected.
const ASSET_PATH = /\.(js|mjs|css|map|woff2?|ttf|otf|eot|wasm|svg|png|jpe?g|gif|webp|avif|ico)$/i;

export default {
  fetch: async (request: Request) => {
    const response = await handler(request);
    const isHtml = response.headers.get('content-type')?.includes('text/html');

    // A hashed asset that resolves to the HTML catch-all no longer exists — an old
    // chunk after a redeploy, or a file briefly unavailable mid-rollout. Cloudflare
    // caches asset URLs by extension and Nitro stamps `/assets/**` with a one-year
    // `immutable` cache-control, so serving 200 HTML here poisons that URL in the
    // browser and at the edge for a year: the client keeps receiving HTML where it
    // expects a module, every dynamic import fails, and soft navigation stays broken
    // until a hard reload. A real `no-store` 404 lets the client recover (Vite reloads
    // onto the new build) and keeps the miss out of every cache.
    if (response.status === 200 && isHtml && ASSET_PATH.test(new URL(request.url).pathname)) {
      return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
    }

    // The SSR document embeds this build's hashed asset URLs and per-user session
    // state, so it must never be reused from a shared or browser cache: a stale
    // document points navigation at chunks a redeploy has already deleted. `private,
    // no-cache` keeps shared caches out and forces the browser to revalidate.
    if (isHtml) {
      response.headers.set('cache-control', 'private, no-cache');
    }
    return response;
  },
};
