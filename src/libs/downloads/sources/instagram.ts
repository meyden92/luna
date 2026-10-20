import type { Source } from './index';

const HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const POST_KINDS = new Set(['p', 'reel', 'reels', 'tv']);
const SHORTCODE = /^[A-Za-z0-9_-]+$/;

export const instagram: Source = {
  key: 'instagram',
  label: 'Instagram',
  // `--use-extractors` takes regexes that must fullmatch an extractor name,
  // case-insensitively. `instagram` therefore loads exactly one extractor, the
  // post extractor ("Instagram"): not instagram:story/tag/user, not InstagramIOS,
  // and never generic (`yt-dlp -v` reports "Loaded 1 extractors").
  extractor: 'instagram',
  parseUrl(input) {
    let url: URL;
    try {
      url = new URL(input.trim());
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!HOSTS.has(url.hostname) || url.port || url.username || url.password) return null;

    // `/<kind>/<code>` with an optional trailing slash; query and fragment are dropped.
    const segments = url.pathname.split('/').slice(1);
    if (segments.at(-1) === '') segments.pop();
    const [kind, shortcode] = segments;
    if (segments.length !== 2 || !kind || !shortcode || !POST_KINDS.has(kind) || !SHORTCODE.test(shortcode)) return null;

    return { canonicalUrl: `https://www.instagram.com/p/${shortcode}/`, shortcode };
  },
};
