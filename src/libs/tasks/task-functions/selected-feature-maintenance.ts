import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/libs/env';
import prisma from '@/libs/prismadb';
import { s3Client } from '@/libs/S3Helper';
import type { TaskFunction } from '@/types/tasks';

export const pruneFileRenditionsExecutor: TaskFunction = async (...args) => {
  const days = typeof args[0] === 'number' ? args[0] : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const renditions = await prisma.fileRendition.findMany({
    where: { lastAccessedAt: { lt: cutoff } },
    select: { id: true, s3Key: true },
    take: 250,
  });

  for (const rendition of renditions) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: rendition.s3Key })).catch(() => undefined);
  }

  await prisma.fileRendition.deleteMany({ where: { id: { in: renditions.map((rendition) => rendition.id) } } });
  return { deleted: renditions.length };
};

export const pruneRawAnalyticsExecutor: TaskFunction = async (...args) => {
  const days = typeof args[0] === 'number' ? args[0] : 90;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [viewEvents, egressEvents] = await Promise.all([
    prisma.viewEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.egressEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  return { viewEvents: viewEvents.count, egressEvents: egressEvents.count };
};
