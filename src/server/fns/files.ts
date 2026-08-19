import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  type GalleryFilters,
  getFileMetadata,
  getOwnedFile,
  listGallery,
  moveFilesToFolder,
  softDeleteFiles,
  updateOwnedFile,
} from '@/db/queries/files';
import { getOwnedFolder } from '@/db/queries/folders';
import { getCdnUrl } from '@/libs/runtime-config';
import { deleteFilesSchema, editFileSchema, moveFilesToFolderSchema } from '@/schemas/file-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';
import type { GalleryFile } from '@/types/project';

export const deleteFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(deleteFilesSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const fileIds = Array.isArray(data.fileIds) ? data.fileIds : [data.fileIds];

    const files = await softDeleteFiles(fileIds, userId, userId);
    if (files.length === 0) throw new Error('No authorized files found for deletion');
    return files;
  });

export const moveFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(moveFilesToFolderSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    if (data.folderId) {
      const folder = await getOwnedFolder(data.folderId, userId);
      if (!folder) throw new Error('Folder not found or unauthorized');
    }

    const result = await moveFilesToFolder({ ids: data.fileIds, ownerId: userId, folderId: data.folderId }, userId);
    if (result.updated === 0) throw new Error('No authorized files found');
    return result;
  });

export const updateFile = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(editFileSchema)
  .handler(async ({ data, context }): Promise<GalleryFile> => {
    const userId = userIdFromCtx(context);
    const fileInfo = await getOwnedFile(data.id, userId);
    if (!fileInfo) {
      throw new Error('Not authorized to update this file info');
    }

    // Sync S3 first so a storage failure can't leave the DB claiming a
    // privacy state the object doesn't actually have.
    if (fileInfo.private !== data.visible) {
      const { fileS3Key, setObjectPrivacy } = await import('@/libs/S3Helper');
      await setObjectPrivacy(fileS3Key(fileInfo.ownerId, fileInfo.url), data.visible);
    }

    const result = await updateOwnedFile(
      {
        id: data.id,
        ownerId: userId,
        values: { tags: data.tags.join(','), title: data.title, private: data.visible },
        metadata: data.lyrics !== undefined || data.artist !== undefined ? { artist: data.artist, lyrics: data.lyrics } : undefined,
      },
      userId,
    );
    if (!result) throw new Error('Not authorized to update this file info');
    const metadata = await getFileMetadata(result.id);

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
        artist: metadata?.artist || '',
        lyrics: metadata?.lyrics || '',
        description: metadata?.description || '',
        genre: metadata?.genre || '',
        duration: metadata?.duration || 0,
        width: metadata?.width ?? null,
        height: metadata?.height ?? null,
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
  .handler(async ({ data, context }) => listGallery(userIdFromCtx(context), data as GalleryFilters));

const downloadSchema = z.object({ url: z.string().min(1) });

const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

function getAllowedDownloadHosts(): Set<string> {
  const hosts = new Set<string>(['replicate.delivery', 'pbxt.replicate.delivery']);
  const cdn = getCdnUrl();
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
