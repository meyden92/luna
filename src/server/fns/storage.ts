import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const proxyImageSchema = z.object({ imageUrl: z.string().min(1) });
const ALLOWED_PROXY_DOMAINS = ['deliver.lunashare.app', 'deliver-dev.lunashare.app', 'replicate.delivery', 'pbxt.replicate.delivery'];

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
    if (!ALLOWED_PROXY_DOMAINS.includes(valid.hostname)) throw new Error('Domain not allowed');

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
