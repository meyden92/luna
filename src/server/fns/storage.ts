import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { env } from '@/libs/env';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const proxyImageSchema = z.object({ imageUrl: z.string().min(1) });

// Hosts the image proxy is allowed to fetch from. The deployment's own CDN is
// derived from CDN_URL and Replicate's delivery hosts back the AI generation
// flow; PROXY_ALLOWED_DOMAINS (comma-separated) adds any extras. Resolved
// lazily so importing this module never touches the environment.
const REPLICATE_DELIVERY_HOSTS = ['replicate.delivery', 'pbxt.replicate.delivery'];

let allowedProxyHosts: Set<string> | undefined;

function getAllowedProxyHosts(): Set<string> {
  if (allowedProxyHosts) return allowedProxyHosts;
  const hosts = new Set(REPLICATE_DELIVERY_HOSTS);
  // CDN_URL is validated as a URL by the env schema.
  hosts.add(new URL(env.CDN_URL).hostname);
  for (const entry of env.PROXY_ALLOWED_DOMAINS?.split(',') ?? []) {
    const host = entry.trim();
    if (host) hosts.add(host);
  }
  allowedProxyHosts = hosts;
  return hosts;
}

export const proxyImage = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(proxyImageSchema)
  .handler(async ({ data }) => {
    let valid: URL;
    try {
      valid = new URL(data.imageUrl);
    } catch {
      throw new Error('Invalid URL format');
    }
    if (!['http:', 'https:'].includes(valid.protocol)) throw new Error('Invalid URL protocol');
    if (!getAllowedProxyHosts().has(valid.hostname)) throw new Error('Domain not allowed');

    const response = await fetch(valid.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'LunaShare-Image-Proxy/1.0' },
    });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);

    const buf = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    return new Response(buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': buf.byteLength.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  });

const cacheImagesSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
  purpose: z.string().optional(),
});

export const listCachedImages = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(cacheImagesSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const purpose = data.purpose ?? 'image-edit';
    const skip = (data.page - 1) * data.limit;

    const [images, totalCount] = await Promise.all([
      prisma.cachedImage.findMany({
        where: { ownerId: userId, purpose },
        orderBy: { createdAt: 'desc' },
        take: data.limit + 1,
        skip,
        select: { id: true, url: true, filename: true, contentType: true, size: true, hash: true, createdAt: true },
      }),
      prisma.cachedImage.count({ where: { ownerId: userId, purpose } }),
    ]);

    const hasMore = images.length > data.limit;
    const responseImages = hasMore ? images.slice(0, data.limit) : images;

    return {
      images: responseImages.map((image) => ({
        key: `cache/${image.hash}.png`,
        url: image.url,
        lastModified: image.createdAt.toISOString(),
        size: image.size,
        hash: image.hash,
        filename: image.filename,
        contentType: image.contentType,
      })),
      hasMore,
      nextPage: hasMore ? data.page + 1 : null,
      totalCount,
    };
  });

export const getStorageUsage = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }): Promise<{ totalBytes: number; fileCount: number }> => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const aggregate = await prisma.file.aggregate({
      where: { ownerId: userId, isDeleted: false },
      _sum: { size: true },
      _count: { _all: true },
    });
    return { totalBytes: aggregate._sum.size ?? 0, fileCount: aggregate._count._all };
  });
