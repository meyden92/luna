import { DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createServerFn } from '@tanstack/react-start';
import { softDeleteFiles } from '@/db/queries/files';
import { createSyncedFile, listFilesForSync } from '@/db/queries/tasks';
import { env } from '@/libs/env';
import { fileS3Key, s3Client } from '@/libs/S3Helper';
import { deleteDbOnlyFilesSchema, deleteS3OnlyFilesSchema, insertS3OnlyFilesToDbSchema } from '@/schemas/sync-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

type S3File = { Key: string; LastModified: Date; ETag: string; Size: number; StorageClass: string };
type S3Entry = { key: string; fileName: string; size: number; lastModified: Date; storageClass: string; etag: string };
type DbSyncFile = { id: string; url: string; title: string; size: number; contentType: string; createdAt: Date };

const DB_COMPARE_PAGE_SIZE = 1000;

export const compareSync = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const userId = userIdFromCtx(context);

    const s3FileMap = new Map<string, S3Entry>();
    let relevantS3Size = 0;
    let token: string | undefined;
    let calls = 0;
    // Cap the listing at 50 pages (~50k objects) to bound runtime/memory on huge
    // buckets; when hit, the comparison result is partial (truncated).
    let truncated = false;
    do {
      calls++;
      const cmd = new ListObjectsV2Command({
        Bucket: env.AWS_BUCKET_NAME,
        Prefix: `${userId}/`,
        ContinuationToken: token,
        MaxKeys: 1000,
      });
      const resp = await s3Client.send(cmd);
      for (const f of (resp.Contents || []) as S3File[]) {
        const fileName = f.Key.slice(`${userId}/`.length);
        if (!fileName || fileName.startsWith('edit-image/')) continue;
        s3FileMap.set(f.Key, {
          key: f.Key,
          fileName,
          size: f.Size,
          lastModified: f.LastModified,
          storageClass: f.StorageClass,
          etag: f.ETag,
        });
        relevantS3Size += f.Size;
      }
      token = resp.NextContinuationToken;
      if (calls > 50) {
        truncated = true;
        break;
      }
    } while (token);

    const totalS3Files = s3FileMap.size;
    const dbOnlyFiles: Array<DbSyncFile & { fullS3Key: string }> = [];
    let syncedCount = 0;
    let totalDbFiles = 0;
    let totalDbSize = 0;
    let dbOnlySize = 0;
    const syncedS3Keys = new Set<string>();
    let dbCursor: string | undefined;
    do {
      const dbFiles = await listFilesForSync({ ownerId: userId, afterId: dbCursor, limit: DB_COMPARE_PAGE_SIZE });

      for (const f of dbFiles) {
        const key = fileS3Key(userId, f.url);
        totalDbFiles++;
        totalDbSize += f.size;
        if (s3FileMap.has(key)) {
          syncedCount++;
          syncedS3Keys.add(key);
        } else {
          dbOnlyFiles.push({ ...f, fullS3Key: key });
          dbOnlySize += f.size;
        }
      }

      dbCursor = dbFiles.at(-1)?.id;
      if (dbFiles.length < DB_COMPARE_PAGE_SIZE || !dbCursor) break;
    } while (dbCursor);

    const s3OnlyFiles: S3Entry[] = [];
    let s3OnlySize = 0;
    for (const [key, data] of s3FileMap) {
      if (syncedS3Keys.has(key)) continue;
      s3OnlyFiles.push(data);
      s3OnlySize += data.size;
    }

    return {
      dbOnlyFiles,
      s3OnlyFiles,
      truncated,
      stats: {
        totalDbFiles,
        totalS3Files,
        syncedFiles: syncedCount,
        dbOnlyCount: dbOnlyFiles.length,
        s3OnlyCount: s3OnlyFiles.length,
        totalDbSize,
        totalS3Size: relevantS3Size,
        dbOnlySize,
        s3OnlySize,
      },
    };
  });

export const deleteDbOnlyFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(deleteDbOnlyFilesSchema)
  .handler(async ({ data, context }) => {
    if (data.fileIds.length === 0) return { deletedCount: 0 };
    const userId = userIdFromCtx(context);
    const deleted = await softDeleteFiles(data.fileIds, userId, userId);
    return { deletedCount: deleted.length };
  });

export const deleteS3OnlyFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(deleteS3OnlyFilesSchema)
  .handler(async ({ data }) => {
    if (data.fileKeys.length === 0) return { deletedCount: 0, errors: [] };
    const result = await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Delete: { Objects: data.fileKeys.map((Key) => ({ Key })) },
      }),
    );
    return { deletedCount: result.Deleted?.length || 0, errors: result.Errors || [] };
  });

export const insertS3OnlyFilesToDb = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(insertS3OnlyFilesToDbSchema)
  .handler(async ({ data, context }) => {
    if (data.files.length === 0) return { insertedCount: 0, errors: [] };
    const errors: string[] = [];
    let insertedCount = 0;
    const adminId = userIdFromCtx(context);

    for (const file of data.files) {
      try {
        const head = await s3Client.send(new HeadObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: file.key }));
        // Admission control and the insert it guards share one Drizzle
        // transaction inside the query module, so the quota row lock is still
        // held when the file row lands.
        await createSyncedFile(
          {
            ownerId: data.targetUserId,
            size: file.size,
            url: encodeURIComponent(file.fileName),
            title: file.fileName,
            contentType: head.ContentType || 'application/octet-stream',
            createdAt: file.lastModified,
          },
          adminId,
        );
        insertedCount++;
      } catch (error) {
        errors.push(`Failed to create database entry for ${file.fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    return { insertedCount, errors };
  });
