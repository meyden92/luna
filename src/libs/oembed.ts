const DEFAULT_EMBED_WIDTH = 640;
const DEFAULT_EMBED_HEIGHT = 360;

export type PublicEmbedFile = {
  id: string;
  title: string | null;
  contentType: string;
  size: number | null;
  cdnUrl: string;
  viewUrl: string;
  embedUrl: string;
  ownerName: string | null;
  metadata: {
    artist: string | null;
    duration: number | null;
    width: number | null;
    height: number | null;
  } | null;
};

export type OEmbedResponse = {
  version: '1.0';
  type: 'rich';
  provider_name: 'LunaShare';
  provider_url: string;
  title: string;
  html: string;
  width: number;
  height: number;
  author_name?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
};

type PublicFileMetaSource = {
  id: string;
  title: string | null;
  contentType: string;
  cdnUrl: string;
  viewUrl: string;
  embedUrl?: string;
};

export function parsePublicViewUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const match = parsed.pathname.replace(/\/+$/, '').match(/^\/view\/([^/]+)$/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function buildOEmbedDiscoveryUrl(viewUrl: string): string {
  const parsed = new URL(viewUrl);
  parsed.pathname = '/api/oembed';
  parsed.search = new URLSearchParams({ url: viewUrl, format: 'json' }).toString();
  return parsed.toString();
}

export function buildOEmbedResponse(
  file: PublicEmbedFile,
  options: { maxWidth?: number | null; maxHeight?: number | null } = {},
): OEmbedResponse {
  const width = Math.min(DEFAULT_EMBED_WIDTH, options.maxWidth ?? DEFAULT_EMBED_WIDTH);
  const height = Math.min(DEFAULT_EMBED_HEIGHT, options.maxHeight ?? DEFAULT_EMBED_HEIGHT);
  const title = file.title?.trim() || 'LunaShare file';
  const response: OEmbedResponse = {
    version: '1.0',
    type: 'rich',
    provider_name: 'LunaShare',
    provider_url: new URL(file.viewUrl).origin,
    title,
    html: `<iframe src="${escapeHtmlAttribute(file.embedUrl)}" title="${escapeHtmlAttribute(title)}" width="${width}" height="${height}" loading="lazy" allowfullscreen></iframe>`,
    width,
    height,
  };

  if (file.ownerName) response.author_name = file.ownerName;
  if (file.contentType.startsWith('image/')) {
    response.thumbnail_url = file.cdnUrl;
    if (file.metadata?.width) response.thumbnail_width = file.metadata.width;
    if (file.metadata?.height) response.thumbnail_height = file.metadata.height;
  }

  return response;
}

export function buildPublicFileMeta(file: PublicFileMetaSource) {
  const title = file.title?.trim() || 'LunaShare file';
  const embedUrl = file.embedUrl ?? `${new URL(file.viewUrl).origin}/embed/${file.id}`;
  const meta = [
    { property: 'og:title', content: title },
    { property: 'og:type', content: mediaOgType(file.contentType) },
    { property: 'og:url', content: file.viewUrl },
    { property: 'og:site_name', content: 'LunaShare' },
    { name: 'twitter:title', content: title },
  ];

  if (file.contentType.startsWith('image/')) {
    meta.push(
      { property: 'og:image', content: file.cdnUrl },
      { property: 'og:image:type', content: file.contentType },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: file.cdnUrl },
    );
    return meta;
  }

  if (file.contentType.startsWith('video/')) {
    meta.push(
      { property: 'og:video', content: file.cdnUrl },
      { property: 'og:video:type', content: file.contentType },
      { name: 'twitter:card', content: 'player' },
      { name: 'twitter:player', content: embedUrl },
      { name: 'twitter:player:stream', content: file.cdnUrl },
      { name: 'twitter:player:stream:content_type', content: file.contentType },
    );
    return meta;
  }

  if (file.contentType.startsWith('audio/')) {
    meta.push(
      { property: 'og:audio', content: file.cdnUrl },
      { property: 'og:audio:type', content: file.contentType },
      { name: 'twitter:card', content: 'player' },
      { name: 'twitter:player', content: embedUrl },
      { name: 'twitter:player:stream', content: file.cdnUrl },
      { name: 'twitter:player:stream:content_type', content: file.contentType },
    );
  }

  return meta;
}

export function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function mediaOgType(contentType: string): string {
  if (contentType.startsWith('video/')) return 'video.other';
  if (contentType.startsWith('audio/')) return 'music.song';
  return 'article';
}

function escapeHtmlAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
