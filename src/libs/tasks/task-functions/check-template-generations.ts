import Replicate from 'replicate';
import { listStuckTemplateGenerations, markTemplateGenerationFailed } from '@/db/queries/tasks';
import { firstReplicateOutput, isAbortError, throwIfAborted } from '@/libs/ai-generation-utils';
import { processSuccessfulGeneration } from '@/libs/template-utils';
import type { TaskFunction } from '@/types/tasks';
import { env } from '../../env';

const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN,
});

const STREAMING_RECONCILE_AFTER_MS = 10 * 60 * 1000;

export const checkTemplateGenerationsExecutor: TaskFunction = async (...args) => {
  const { signal } = args[args.length - 1];
  throwIfAborted(signal);
  const staleStreamingCutoff = new Date(Date.now() - STREAMING_RECONCILE_AFTER_MS);
  // Batched to avoid timeouts.
  const processingGenerations = await listStuckTemplateGenerations(staleStreamingCutoff, 20);

  if (processingGenerations.length === 0) {
    return { processed: 0 };
  }

  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    stillProcessing: 0,
    errors: 0,
  };

  for (const generation of processingGenerations) {
    throwIfAborted(signal);
    // Selected only once past the staleness cutoff, so there is no prediction
    // to wait for — the stream died before it created or recorded one.
    if (!generation.replicateId) {
      await markTemplateGenerationFailed(generation.id, { errorMessage: 'Generation was interrupted' }, null);
      results.failed++;
      results.processed++;
      continue;
    }

    try {
      const prediction = await replicate.predictions.get(generation.replicateId, { signal });

      if (prediction.status === 'succeeded') {
        const resultImageUrl = firstReplicateOutput(prediction.output);
        if (resultImageUrl) {
          await processSuccessfulGeneration(
            generation.id,
            resultImageUrl,
            generation.userId,
            generation.templateId,
            generation.template.name,
            prediction.status,
            undefined,
            signal,
          );
          results.succeeded++;
        } else {
          // Handle empty output
          throwIfAborted(signal);
          // A scheduled task has no acting user, so the audit row is attributed
          // to nobody rather than misattributed.
          await markTemplateGenerationFailed(generation.id, { errorMessage: 'No output generated' }, null);
          results.failed++;
        }
      } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throwIfAborted(signal);
        await markTemplateGenerationFailed(
          generation.id,
          { errorMessage: String(prediction.error) || 'Generation failed', replicateStatus: prediction.status },
          null,
        );
        results.failed++;
      } else {
        results.stillProcessing++;
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw error;
      console.error(`Error checking generation ${generation.id}:`, error);
      results.errors++;
    }
    results.processed++;
  }

  return results;
};
