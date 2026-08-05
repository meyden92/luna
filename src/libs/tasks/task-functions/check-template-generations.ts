import Replicate from 'replicate';
import { firstReplicateOutput, isAbortError, throwIfAborted } from '@/libs/ai-generation-utils';
import prisma from '@/libs/prismadb';
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
  const processingGenerations = await prisma.templateGeneration.findMany({
    where: {
      status: 'processing',
      replicateId: { not: null },
      OR: [{ replicateStatus: null }, { replicateStatus: { not: 'streaming' } }, { createdAt: { lt: staleStreamingCutoff } }],
    },
    include: {
      template: true,
    },
    take: 20, // Process in batches to avoid timeouts
  });

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
    if (!generation.replicateId) continue;

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
          await prisma.templateGeneration.update({
            where: { id: generation.id },
            data: { status: 'failed', errorMessage: 'No output generated' },
          });
          results.failed++;
        }
      } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throwIfAborted(signal);
        await prisma.templateGeneration.update({
          where: { id: generation.id },
          data: {
            status: 'failed',
            errorMessage: String(prediction.error) || 'Generation failed',
            replicateStatus: prediction.status,
          },
        });
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
