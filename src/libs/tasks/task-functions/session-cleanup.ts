import { deleteExpiredSessions } from '@/db/queries/tasks';
import { throwIfAborted } from '@/libs/ai-generation-utils';
import type { TaskFunction } from '@/types/tasks';

/**
 * Bulk-deletes expired Better Auth sessions.
 *
 * `Session` is in `UNAUDITED_MODELS` (session and auth churn), so this writes no
 * audit rows — the implicit Prisma extension would have attempted one per row.
 */
export const deleteExpiredSessionsExecutor: TaskFunction = async (...args) => {
  const { signal } = args[args.length - 1];
  throwIfAborted(signal);
  const now = new Date();

  const deletedCount = await deleteExpiredSessions(now);

  throwIfAborted(signal);

  return {
    summary: deletedCount > 0 ? `Deleted ${deletedCount} expired sessions` : 'No expired sessions found',
    details: {
      deletedCount,
      executedAt: now.toISOString(),
    },
  };
};
