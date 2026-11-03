import { throwIfAborted } from '@/libs/abort';
import { sweepExpiredOutputs } from '@/libs/studio/pipeline';
import type { TaskFunction } from '@/types/tasks';

/**
 * Deletes the S3 objects of Studio Outputs that passed their 7-day expiry
 * without being saved to Files, and marks them expired. Generations and
 * Output rows stay, so the history keeps the prompt, Model and cost.
 */
export const expireStudioOutputsExecutor: TaskFunction = async (...args) => {
  const { signal } = args[args.length - 1];
  throwIfAborted(signal);
  const expiredCount = await sweepExpiredOutputs(signal);
  return {
    summary: expiredCount > 0 ? `Expired ${expiredCount} Studio Outputs` : 'No Studio Outputs expired',
    details: { expiredCount, executedAt: new Date().toISOString() },
  };
};
