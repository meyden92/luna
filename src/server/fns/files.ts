import type { Prisma } from '@db/client';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { deleteFilesSchema, editFileSchema, moveFilesToFolderSchema } from '@/schemas/file-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';
import type { GalleryFile } from '@/types/project';

export const deleteFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(deleteFilesSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const fileIds = Array.isArray(data.fileIds) ? data.fileIds : [data.fileIds];

    const files = await prisma.file.findMany({
      where: { id: { in: fileIds }, ownerId: userId, isDeleted: false },
    });
    if (files.length === 0) throw new Error('No authorized files found for deletion');

    const verifiedFileIds = files.map((file) => file.id);
    await prisma.file.updateMany({
      where: { id: { in: verifiedFileIds }, ownerId: userId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return files;
  });

export const moveFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(moveFilesToFolderSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    if (data.folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: data.folderId, ownerId: userId } });
      if (!folder) throw new Error('Folder not found or unauthorized');
    }

    const files = await prisma.file.findMany({
      where: { id: { in: data.fileIds }, ownerId: userId, isDeleted: false },
    });
    if (files.length === 0) throw new Error('No authorized files found');

    const updated = await prisma.file.updateMany({
      where: { id: { in: data.fileIds }, ownerId: userId },
      data: { folderId: data.folderId },
    });
    return { updated: updated.count, folderId: data.folderId };
  });

export const updateFile = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(editFileSchema)
  .handler(async ({ data, context }): Promise<GalleryFile> => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const fileInfo = await prisma.file.findUnique({ where: { id: data.id, ownerId: userId } });
    if (!fileInfo) {
      throw new Error('Not authorized to update this file info');
    }

    const updateData: Prisma.FileUpdateInput = {
      tags: data.tags.join(','),
      title: data.title,
      private: data.visible,
    };

    if (data.lyrics !== undefined || data.artist !== undefined) {
      updateData.metadata = {
        upsert: {
          create: { artist: data.artist || '', lyrics: data.lyrics || '' },
          update: { artist: data.artist || '', lyrics: data.lyrics || '' },
        },
      };
    }

    // Sync S3 first so a storage failure can't leave the DB claiming a
    // privacy state the object doesn't actually have.
    if (fileInfo.private !== data.visible) {
      const { fileS3Key, setObjectPrivacy } = await import('@/libs/S3Helper');
      await setObjectPrivacy(fileS3Key(fileInfo.ownerId, fileInfo.url), data.visible);
    }

    const result = await prisma.file.update({
      where: { id: data.id, ownerId: userId },
      data: updateData,
      include: { metadata: true },
    });

    return {
      id: result.id,
      title: result.title || '',
      createdAt: result.createdAt,
      ownerId: result.ownerId,
      folderId: result.folderId,
      tags: result.tags || '',
      url: result.url,
      private: result.private,
      size: result.size,
      contentType: result.contentType,
      isDeleted: result.isDeleted,
      metadata: {
        artist: result.metadata?.artist || '',
        lyrics: result.metadata?.lyrics || '',
        description: result.metadata?.description || '',
        genre: result.metadata?.genre || '',
        duration: result.metadata?.duration || 0,
        width: result.metadata?.width ?? null,
        height: result.metadata?.height ?? null,
      },
    };
  });

// Accepts the client-side GalleryFilters shape directly (plus paging) so the
// filter semantics live in one place — here.
const galleryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  fileType: z.enum(['image', 'video', 'file']).optional(),
  fileTypeOperator: z.enum(['is', 'is not']).optional(),
  folderId: z.string().nullish(),
  privacy: z.enum(['public', 'private']).optional(),
  tags: z.array(z.string()).optional(),
  tagsOperator: z.enum(['is', 'is not', 'one of', 'none of']).optional(),
  excludeFoldered: z.boolean().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'size']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export const getGallery = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(galleryQuerySchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const {
      cursor: cursorId,
      limit: itemsPerPage = 10,
      search: searchValue,
      startDate: start,
      endDate: end,
      fileType: type,
      fileTypeOperator: typeOp,
      folderId: folder,
      privacy: privacyFilter,
      tags: tagList,
      tagsOperator: tagsOp,
      excludeFoldered: shouldExcludeFoldered,
      sortBy: sortField = 'createdAt',
      sortDirection: sortDir = 'desc',
    } = data;

    // Each independent filter (search, type, tags) becomes its own clause in
    // `and` so OR-groups never clobber or bleed into one another.
    const where: Prisma.FileWhereInput = { ownerId: userId, isDeleted: false };
    const and: Prisma.FileWhereInput[] = [];

    if (folder) where.folderId = folder;
    else if (shouldExcludeFoldered) where.folderId = null;

    if (searchValue) {
      and.push({ OR: [{ title: { contains: searchValue } }, { tags: { contains: searchValue } }] });
    }
    if (start || end) {
      where.createdAt = {
        ...(start ? { gte: new Date(start) } : {}),
        ...(end ? { lte: new Date(end) } : {}),
      };
    }

    if (type && typeOp !== 'is not') {
      if (type === 'image') where.contentType = { startsWith: 'image/' };
      else if (type === 'video') where.contentType = { startsWith: 'video/' };
      else if (type === 'file')
        and.push({ NOT: { contentType: { startsWith: 'image/' } } }, { NOT: { contentType: { startsWith: 'video/' } } });
    } else if (type && typeOp === 'is not') {
      if (type === 'image') where.NOT = { contentType: { startsWith: 'image/' } };
      else if (type === 'video') where.NOT = { contentType: { startsWith: 'video/' } };
      else if (type === 'file') and.push({ OR: [{ contentType: { startsWith: 'image/' } }, { contentType: { startsWith: 'video/' } }] });
    }

    if (privacyFilter) where.private = privacyFilter === 'private';

    if (tagList && tagList.length > 0) {
      const isNegative = tagsOp === 'is not' || tagsOp === 'none of';
      const conds = tagList.filter((t) => t.trim()).map((tag) => ({ tags: { contains: tag.trim() } }));
      if (conds.length > 0) and.push(isNegative ? { NOT: { OR: conds } } : { OR: conds });
    }

    if (and.length > 0) where.AND = and;

    const sortFieldMap: Record<string, string> = {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      name: 'title',
      size: 'size',
    };
    const orderByField = sortFieldMap[sortField] || 'createdAt';

    const files = await prisma.file.findMany({
      where,
      orderBy: [{ [orderByField]: sortDir }, { id: sortDir }],
      select: {
        id: true,
        title: true,
        createdAt: true,
        ownerId: true,
        folderId: true,
        tags: true,
        url: true,
        private: true,
        size: true,
        contentType: true,
        metadata: { select: { width: true, height: true, duration: true } },
        folder: { select: { id: true, name: true, color: true } },
      },
      take: itemsPerPage + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hasNextPage = files.length > itemsPerPage;
    const returnFiles = hasNextPage ? files.slice(0, itemsPerPage) : files;
    const nextCursor = hasNextPage ? (returnFiles[returnFiles.length - 1]?.id ?? null) : null;

    return { files: returnFiles, nextCursor };
  });

const downloadSchema = z.object({ url: z.string().min(1) });

const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

function getAllowedDownloadHosts(): Set<string> {
  const hosts = new Set<string>(['replicate.delivery', 'pbxt.replicate.delivery']);
  const cdn = import.meta.env.VITE_PUBLIC_CDN_URL;
  if (cdn) {
    try {
      hosts.add(new URL(cdn).hostname);
    } catch {
      /* ignore */
    }
  }
  return hosts;
}

export const downloadProxy = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(downloadSchema)
  .handler(async ({ data }) => {
    let target: URL;
    try {
      target = new URL(data.url);
    } catch {
      throw new Error('Invalid URL');
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Invalid URL protocol');

    const allowed = getAllowedDownloadHosts();
    if (!allowed.has(target.hostname)) throw new Error('Download target not allowed');

    const response = await fetch(target.toString());
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

    const cl = Number(response.headers.get('content-length') ?? '0');
    if (cl > MAX_DOWNLOAD_BYTES) throw new Error('File too large');

    const blob = await response.blob();
    if (blob.size > MAX_DOWNLOAD_BYTES) throw new Error('File too large');

    return new Response(blob, {
      headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream' },
    });
  });
