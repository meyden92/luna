import { throwIfAborted } from '@/libs/ai-generation-utils';
import prisma from '@/libs/prismadb';
import type { TaskFunction } from '@/types/tasks';

export const deleteExpiredSessionsExecutor: TaskFunction = async (...args) => {
  const { signal } = args[args.length - 1];
  throwIfAborted(signal);
  const now = new Date();

  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  throwIfAborted(signal);
  const deletedCount = result.count;

  return {
    summary: deletedCount > 0 ? `Deleted ${deletedCount} expired sessions` : 'No expired sessions found',
    details: {
      deletedCount,
      executedAt: now.toISOString(),
    },
  };
};
