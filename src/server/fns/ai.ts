import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import * as ai from '@/db/queries/ai';
import { softDeleteFiles } from '@/db/queries/files';
import { markTemplateGenerationFailed } from '@/db/queries/tasks';
import { getCDNImage } from '@/libs/utils';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const STREAMING_RECONCILE_AFTER_MS = 10 * 60 * 1000;

const aiModelsSchema = z.object({ type: z.enum(['editing', 'generation']).optional() });

async function getReplicate() {
  const [{ default: Replicate }, { env }] = await Promise.all([import('replicate'), import('@/libs/env')]);
  return new Replicate({ auth: env.REPLICATE_API_TOKEN });
}

export const listAiModels = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(aiModelsSchema)
  .handler(async ({ data }) => {
    if (data.type === 'generation') return ai.listActiveGenerationModels();
    return ai.listActiveEditingModels();
  });

export const listAiTemplates = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async () => {
    return { templates: await ai.listActiveTemplates() };
  });

export const getTemplateGeneration = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const generation = await ai.getTemplateGenerationWithResult(data.id);
    if (!generation) throw new Error('Generation not found');
    if (generation.userId !== userId) throw new Error('Unauthorized');

    if (generation.status === 'success' || generation.status === 'failed') {
      return {
        id: generation.id,
        status: generation.status,
        resultImageUrl: generation.resultFile?.url ? getCDNImage(generation.resultFile.url, userId) : null,
        error: generation.errorMessage,
        finalPrompt: generation.finalPrompt,
      };
    }

    if (generation.status === 'processing' && generation.replicateId) {
      const [{ firstReplicateOutput }, { processSuccessfulGeneration }] = await Promise.all([
        import('@/libs/ai-generation-utils'),
        import('@/libs/template-utils'),
      ]);
      const replicate = await getReplicate();
      const isActiveStream =
        generation.replicateStatus === 'streaming' && generation.createdAt.getTime() > Date.now() - STREAMING_RECONCILE_AFTER_MS;
      if (isActiveStream) {
        return { id: generation.id, status: 'processing', replicateStatus: generation.replicateStatus };
      }

      const prediction = await replicate.predictions.get(generation.replicateId);

      if (prediction.status === 'succeeded') {
        const resultImageUrl = firstReplicateOutput(prediction.output);
        if (!resultImageUrl) {
          await markTemplateGenerationFailed(generation.id, { errorMessage: 'No output generated' }, userId);
          return { id: generation.id, status: 'failed', error: 'No output generated' };
        }
        const url = await processSuccessfulGeneration(
          generation.id,
          resultImageUrl,
          userId,
          generation.templateId,
          generation.template.name,
          'succeeded',
          generation.customTitle,
        );
        return { id: generation.id, status: 'success', resultImageUrl: url, finalPrompt: generation.finalPrompt };
      }
      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        await markTemplateGenerationFailed(
          generation.id,
          { errorMessage: String(prediction.error) || 'Generation failed', replicateStatus: prediction.status },
          userId,
        );
        return { id: generation.id, status: 'failed' as const, error: String(prediction.error ?? 'failed') };
      }
      return { id: generation.id, status: 'processing', replicateStatus: prediction.status };
    }

    return { id: generation.id, status: generation.status };
  });

export const getActiveGenerations = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const [{ firstReplicateOutput }, { processSuccessfulGeneration }] = await Promise.all([
      import('@/libs/ai-generation-utils'),
      import('@/libs/template-utils'),
    ]);
    const replicate = await getReplicate();
    const userId = userIdFromCtx(context);
    const staleStreamingCutoff = new Date(Date.now() - STREAMING_RECONCILE_AFTER_MS);
    const processing = await ai.listReconcilableTemplateGenerations(userId, staleStreamingCutoff);

    await Promise.all(
      processing.map(async (gen) => {
        if (!gen.replicateId) return;
        try {
          const pred = await replicate.predictions.get(gen.replicateId);
          if (pred.status === 'succeeded') {
            const out = firstReplicateOutput(pred.output);
            if (out) {
              await processSuccessfulGeneration(gen.id, out, userId, gen.templateId, gen.template.name, pred.status);
            } else {
              await markTemplateGenerationFailed(gen.id, { errorMessage: 'No output generated' }, userId);
            }
          } else if (pred.status === 'failed' || pred.status === 'canceled') {
            await markTemplateGenerationFailed(
              gen.id,
              { errorMessage: String(pred.error) || 'Generation failed', replicateStatus: pred.status },
              userId,
            );
          }
        } catch (e) {
          console.error(`Error checking generation ${gen.id}:`, e);
        }
      }),
    );

    return { generations: await ai.listActiveTemplateGenerations(userId) };
  });

export const deleteTemplateGeneration = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ generationId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const [{ DeleteObjectCommand }, { env }, { fileS3Key, s3Client }] = await Promise.all([
      import('@aws-sdk/client-s3'),
      import('@/libs/env'),
      import('@/libs/S3Helper'),
    ]);
    const userId = userIdFromCtx(context);
    const generation = await ai.getOwnedTemplateGenerationWithResult(data.generationId, userId);
    if (!generation) throw new Error('Generation not found or access denied');
    if (!generation.resultFile) throw new Error('No file associated with this generation');

    const s3Key = fileS3Key(userId, generation.resultFile.url);
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: s3Key }));
    } catch (e) {
      console.error(`Failed to delete from S3: ${s3Key}`, e);
    }

    await softDeleteFiles([generation.resultFile.id], userId, userId);
    await ai.detachTemplateGenerationResult({ id: data.generationId, ownerId: userId, errorMessage: 'Image deleted by user' }, userId);

    return { success: true, generationId: data.generationId, message: 'Image deleted successfully' };
  });
