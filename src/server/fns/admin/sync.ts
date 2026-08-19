import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { listFilesForSync, softDeleteFilesAnyOwner } from '@/db/queries/tasks';
import { env } from '@/libs/env';
import { fileS3Key, s3Client } from '@/libs/S3Helper';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

type S3Object = { Key: string; LastModified: Date; ETag: string; Size: number; StorageClass: string };
type S3Entry = { key: string; fileName: string; size: number; lastModified: Date; storageClass: string; etag: string };
type DbSyncFile = { id: string; url: string; title: string; size: number; contentType: string; createdAt: Date; ownerId: string };

const DB_COMPARE_PAGE_SIZE = 1000;

export const compareAdminSync = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    const s3FileMap = new Map<string, S3Entry>();
    let totalS3Size = 0;
    let token: string | undefined;
    let calls = 0;
    do {
      calls++;
      const resp = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: env.AWS_BUCKET_NAME,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      for (const f of (resp.Contents || []) as S3Object[]) {
        const fileName = f.Key.split('/').slice(1).join('/');
        if (!fileName || fileName.startsWith('edit-image/') || f.Key.startsWith('cache/') || f.Key.startsWith('templates/')) continue;
        s3FileMap.set(f.Key, {
          key: f.Key,
          fileName,
          size: f.Size,
          lastModified: f.LastModified,
          storageClass: f.StorageClass,
          etag: f.ETag,
        });
        totalS3Size += f.Size;
      }
      token = resp.NextContinuationToken;
      if (calls > 200) break;
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
      const dbFiles = await listFilesForSync({ afterId: dbCursor, limit: DB_COMPARE_PAGE_SIZE });

      for (const f of dbFiles) {
        const key = fileS3Key(f.ownerId, f.url);
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
      stats: {
        totalDbFiles,
        totalS3Files,
        syncedFiles: syncedCount,
        dbOnlyCount: dbOnlyFiles.length,
        s3OnlyCount: s3OnlyFiles.length,
        totalDbSize,
        totalS3Size,
        dbOnlySize,
        s3OnlySize,
      },
    };
  });

export const deleteAdminDbOnlyFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ fileIds: z.array(z.string()).min(1) }))
  .handler(async ({ data, context }) => {
    const deletedCount = await softDeleteFilesAnyOwner(data.fileIds, adminIdFromCtx(context));
    return { deletedCount };
  });
