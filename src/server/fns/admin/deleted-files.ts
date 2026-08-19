import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { createServerFn } from '@tanstack/react-start';
import {
  hardDeleteFiles,
  listDeletedFilesWithOwner,
  listSoftDeletedFiles,
  restoreDeletedFiles as queryRestoreDeletedFiles,
} from '@/db/queries/admin';
import { env } from '@/libs/env';
import { fileS3Key, s3Client } from '@/libs/S3Helper';
import { permanentlyDeleteFilesSchema, restoreFilesSchema } from '@/schemas/admin/deleted-files-schema';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const listDeletedFiles = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return listDeletedFilesWithOwner();
  });

export const restoreDeletedFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(restoreFilesSchema)
  .handler(async ({ data, context }) => {
    const restored = await queryRestoreDeletedFiles(data.fileIds, adminIdFromCtx(context));
    if (restored.length === 0) throw new Error('No soft-deleted files found with the provided IDs');

    return { restoredCount: restored.length, fileIds: restored.map((f) => f.id) };
  });

export const permanentlyDeleteFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(permanentlyDeleteFilesSchema)
  .handler(async ({ data, context }) => {
    const filesToDelete = await listSoftDeletedFiles(data.fileIds);
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
    const deletedCount = await hardDeleteFiles(deletableIds, adminIdFromCtx(context));
    return {
      deletedCount,
      s3DeletedCount,
      errors,
      fileIds: deletableIds,
    };
  });
