import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { deleteFileRenditions, listStaleFileRenditions } from '@/db/queries/tasks';
import { getS3 } from '@/libs/S3Helper';
import type { TaskFunction } from '@/types/tasks';

export const pruneFileRenditionsExecutor: TaskFunction = async (...args) => {
  const days = typeof args[0] === 'number' ? args[0] : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const renditions = await listStaleFileRenditions(cutoff, 250);

  const { client, bucket } = getS3();
  for (const rendition of renditions) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: rendition.s3Key })).catch(() => undefined);
  }

  await deleteFileRenditions(renditions.map((rendition) => rendition.id));
  return { deleted: renditions.length };
};
