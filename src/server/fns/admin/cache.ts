import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createServerFn } from '@tanstack/react-start';
import { purgeCachedImages, purgeTemplateGenerations } from '@/db/queries/admin';
import { env } from '@/libs/env';
import { s3Client } from '@/libs/S3Helper';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const CACHE_PREFIX = 'cache/';

async function listCacheKeys(): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const resp = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: env.AWS_BUCKET_NAME,
        Prefix: CACHE_PREFIX,
        ContinuationToken: token,
      }),
    );
    if (resp.Contents) {
      for (const o of resp.Contents) if (o.Key) keys.push(o.Key);
    }
    token = resp.NextContinuationToken;
  } while (token);
  return keys;
}

export const purgeGenerativeCache = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async ({ context }) => {
    const keys = (await listCacheKeys()).filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_PREFIX);

    if (keys.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        try {
          await s3Client.send(
            new DeleteObjectsCommand({
              Bucket: env.AWS_BUCKET_NAME,
              Delete: { Objects: batch.map((Key) => ({ Key })) },
            }),
          );
        } catch (e) {
          console.error('Error deleting batch from S3:', e);
        }
      }
    }

    const dbCacheRecordsDeleted = await purgeCachedImages();
    const dbGenerationRecordsDeleted = await purgeTemplateGenerations(adminIdFromCtx(context));

    return {
      success: true,
      message: 'Purge complete.',
      details: {
        s3ObjectsDeleted: keys.length,
        dbCacheRecordsDeleted,
        dbGenerationRecordsDeleted,
      },
    };
  });
