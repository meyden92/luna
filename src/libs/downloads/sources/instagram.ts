import type { Source } from './index';

const HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const POST_KINDS = new Set(['p', 'reel', 'reels', 'tv']);
const SHORTCODE = /^[A-Za-z0-9_-]+$/;

export const instagram: Source = {
  key: 'instagram',
  label: 'Instagram',
  cookieDomain: 'instagram.com',
  // `--use-extractors` takes regexes that must fullmatch an extractor name,
  // case-insensitively. `instagram` therefore loads exactly one extractor, the
  // post extractor ("Instagram"): not instagram:story/tag/user, not InstagramIOS,
  // and never generic (`yt-dlp -v` reports "Loaded 1 extractors").
  extractor: 'instagram',
  // From the stderr of yt-dlp 2026.08.19 (its Instagram extractor and HTTP layer),
  // captured from failing posts:
  // - unknown shortcode: "Instagram sent an empty media response. Check if this post
  //   is accessible in your browser … use --cookies-from-browser or --cookies …"
  // - private account (long shortcode): "This content is only available for registered
  //   users who follow this account. Use --cookies-from-browser or --cookies …"
  // - HTTP layer: "Unable to download webpage: HTTP Error 404: Not Found", likewise 401 and
  //   "HTTP Error 429: Too Many Requests"
  // and from the extractor source, not seen live: anonymous rate limit ("…redirected to
  // the login page. You have exceeded the rate-limit…") and "Restricted Video" rulings.
  // Order matters: the rate limit and the empty response also suggest --cookies.
  errorPatterns: [
    { pattern: /HTTP Error 429|rate-limit|Please wait a few minutes/i, category: 'rate_limited' },
    { pattern: /HTTP Error 404|empty media response|not available/i, category: 'not_found' },
    { pattern: /HTTP Error 401|--cookies|registered users|Restricted Video/i, category: 'needs_login' },
  ],
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
