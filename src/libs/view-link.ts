/*
 * The share link, `/view/<id>`, and the extension it carries for images.
 *
 * Discord only renders a bare inline image (no card, no URL text) when the
 * link's path ends in an image extension and the response is the image itself.
 * So image share links end in `.jpg`/`.png`/…, and `/view/$id` redirects
 * Discord's crawler to the raw file while everyone else gets the share page.
 */

// The image types Discord inlines, with the extension their share link carries.
const VIEW_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

// `.jpeg` too, for a hand-typed link.
const VIEW_EXTENSION_SUFFIX = new RegExp(`(${[...Object.values(VIEW_EXTENSIONS), '.jpeg'].join('|').replaceAll('.', '\\.')})$`, 'i');

// Discord's metadata crawler. Its media proxy fetches the redirect target with
// a browser user-agent, which is why the target must serve anyone.
const DISCORD_CRAWLER_UA = /Discordbot/i;

/** The extension an image's share link ends in, or '' when Discord would not inline the type. */
export function viewExtension(contentType: string): string {
  return VIEW_EXTENSIONS[contentType] ?? '';
}

/** The public share link for a file. */
export function buildViewUrl(origin: string, file: { id: string; contentType: string }): string {
  return `${origin}/view/${file.id}${viewExtension(file.contentType)}`;
}

/** The file id from a `/view/$id` path segment, with or without its extension. */
export function parseViewId(segment: string): string {
  return segment.replace(VIEW_EXTENSION_SUFFIX, '');
}

/** True for Discord's link-preview crawler. */
export function isDiscordCrawler(userAgent: string | null): boolean {
  return userAgent !== null && DISCORD_CRAWLER_UA.test(userAgent);
}
