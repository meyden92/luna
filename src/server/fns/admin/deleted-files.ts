import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { createServerFn } from '@tanstack/react-start';
import { env } from '@/libs/env';
import prisma from '@/libs/prismadb';
import { fileS3Key, s3Client } from '@/libs/S3Helper';
import { permanentlyDeleteFilesSchema, restoreFilesSchema } from '@/schemas/admin/deleted-files-schema';
import { appMiddleware } from '@/server/server-fn';

export const listDeletedFiles = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return prisma.file.findMany({
      where: { isDeleted: true },
      include: { owner: { select: { id: true, name: true, email: true } } },
      orderBy: [{ deletedAt: 'desc' }, { owner: { name: 'asc' } }],
    });
  });

export const restoreDeletedFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(restoreFilesSchema)
  .handler(async ({ data }) => {
    const filesToRestore = await prisma.file.findMany({
      where: { id: { in: data.fileIds }, isDeleted: true },
      select: { id: true, title: true },
    });
    if (filesToRestore.length === 0) throw new Error('No soft-deleted files found with the provided IDs');

    const result = await prisma.file.updateMany({
      where: { id: { in: filesToRestore.map((f) => f.id) }, isDeleted: true },
      data: { isDeleted: false, deletedAt: null },
    });
    return { restoredCount: result.count, fileIds: filesToRestore.map((f) => f.id) };
  });

export const permanentlyDeleteFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(permanentlyDeleteFilesSchema)
  .handler(async ({ data }) => {
    const filesToDelete = await prisma.file.findMany({
      where: { id: { in: data.fileIds }, isDeleted: true },
      select: { id: true, url: true, ownerId: true, title: true, size: true },
    });
    if (filesToDelete.length === 0) throw new Error('No soft-deleted files found with the provided IDs');

    const errors: string[] = [];
    let s3DeletedCount = 0;
    // Track keys S3 failed to delete so we keep their DB rows for retry instead
    // of orphaning the storage object.
    const failedKeys = new Set<string>();

    try {
      const result = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: env.AWS_BUCKET_NAME,
          Delete: {
            Objects: filesToDelete.map((file) => ({ Key: fileS3Key(file.ownerId, file.url) })),
            Quiet: false,
          },
        }),
      );
      s3DeletedCount = result.Deleted?.length || 0;
      for (const err of result.Errors || []) {
        if (err.Key) failedKeys.add(err.Key);
        errors.push(`S3 Error for ${err.Key}: ${err.Message}`);
      }
    } catch (e) {
      // The whole batch failed: keep every DB row.
      for (const file of filesToDelete) failedKeys.add(fileS3Key(file.ownerId, file.url));
      errors.push(`S3 bulk deletion failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    const deletableIds = filesToDelete.filter((f) => !failedKeys.has(fileS3Key(f.ownerId, f.url))).map((f) => f.id);
    const dbResult = await prisma.file.deleteMany({
      where: { id: { in: deletableIds }, isDeleted: true },
    });
    return {
      deletedCount: dbResult.count,
      s3DeletedCount,
      errors,
      fileIds: deletableIds,
    };
  });
