import { GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { listImagesMissingDimensions, upsertFileDimensions } from '@/db/queries/tasks';
import { isAbortError, throwIfAborted } from '@/libs/ai-generation-utils';
import { s3Client } from '@/libs/S3Helper';
import type { TaskFunction } from '@/types/tasks';
import { env } from '../../env';

const BATCH_SIZE = 25;

export const rescanImageDimensionsExecutor: TaskFunction = async (...args) => {
  const { signal } = args[args.length - 1];
  throwIfAborted(signal);
  const files = await listImagesMissingDimensions();

  const results = { scanned: 0, updated: 0, failed: 0 };

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    throwIfAborted(signal);
    const batch = files.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (file) => {
        results.scanned++;
        try {
          throwIfAborted(signal);
          // file.url is stored URI-encoded; the S3 object key uses the raw filename.
          const key = `${file.ownerId}/${decodeURIComponent(file.url)}`;
          const object = await s3Client.send(new GetObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }), { abortSignal: signal });
          if (!object.Body) throw new Error('Empty S3 response body');

          const buffer = Buffer.from(await object.Body.transformToByteArray());
          throwIfAborted(signal);
          const { width, height } = await sharp(buffer).metadata();
          if (!width || !height) throw new Error('Could not determine image dimensions');

          throwIfAborted(signal);
          await upsertFileDimensions(file.id, width, height);
          results.updated++;
        } catch (error) {
          if (signal.aborted || isAbortError(error)) throw error;
          results.failed++;
          console.error(`[Task:rescanImageDimensions] Failed to rescan file ${file.id}:`, error);
        }
      }),
    );
  }

  return results;
};
