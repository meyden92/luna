import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getCDNImage } from '@/libs/utils';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const STREAMING_RECONCILE_AFTER_MS = 10 * 60 * 1000;

const aiModelsSchema = z.object({ type: z.enum(['editing', 'generation']).optional() });

async function getPrisma() {
  const { default: prisma } = await import('@/libs/prismadb');
  return prisma;
}

async function getReplicate() {
  const [{ default: Replicate }, { env }] = await Promise.all([import('replicate'), import('@/libs/env')]);
  return new Replicate({ auth: env.REPLICATE_API_TOKEN });
}

export const listAiModels = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(aiModelsSchema)
  .handler(async ({ data }) => {
    const prisma = await getPrisma();
    if (data.type === 'generation') {
      return prisma.generationModel.findMany({
        where: { isActive: true },
        include: { fields: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      });
    }
    return prisma.editingModel.findMany({
      where: { isActive: true },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  });

export const listAiTemplates = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async () => {
    const prisma = await getPrisma();
    const templates = await prisma.template.findMany({
      where: { isActive: true },
      include: {
        globalVariables: { include: { globalVariable: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { templates };
  });

export const getTemplateGeneration = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const prisma = await getPrisma();
    const userId = userIdFromCtx(context);
    const generation = await prisma.templateGeneration.findUnique({
      where: { id: data.id },
      include: { resultFile: true, template: true },
    });
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
          await prisma.templateGeneration.update({
            where: { id: generation.id },
            data: { status: 'failed', errorMessage: 'No output generated' },
          });
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
        await prisma.templateGeneration.update({
          where: { id: generation.id },
          data: {
            status: 'failed',
            errorMessage: String(prediction.error) || 'Generation failed',
            replicateStatus: prediction.status,
          },
        });
        return { id: generation.id, status: 'failed' as const, error: String(prediction.error ?? 'failed') };
      }
      return { id: generation.id, status: 'processing', replicateStatus: prediction.status };
    }

    return { id: generation.id, status: generation.status };
  });

export const getActiveGenerations = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const prisma = await getPrisma();
    const [{ firstReplicateOutput }, { processSuccessfulGeneration }] = await Promise.all([
      import('@/libs/ai-generation-utils'),
      import('@/libs/template-utils'),
    ]);
    const replicate = await getReplicate();
    const userId = userIdFromCtx(context);
    const staleStreamingCutoff = new Date(Date.now() - STREAMING_RECONCILE_AFTER_MS);
    const processing = await prisma.templateGeneration.findMany({
      where: {
        userId,
        status: 'processing',
        replicateId: { not: null },
        OR: [{ replicateStatus: null }, { replicateStatus: { not: 'streaming' } }, { createdAt: { lt: staleStreamingCutoff } }],
      },
      include: { template: true },
    });

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
              await prisma.templateGeneration.update({
                where: { id: gen.id },
                data: { status: 'failed', errorMessage: 'No output generated' },
              });
            }
          } else if (pred.status === 'failed' || pred.status === 'canceled') {
            await prisma.templateGeneration.update({
              where: { id: gen.id },
              data: {
                status: 'failed',
                errorMessage: String(pred.error) || 'Generation failed',
                replicateStatus: pred.status,
              },
            });
          }
        } catch (e) {
          console.error(`Error checking generation ${gen.id}:`, e);
        }
      }),
    );

    const active = await prisma.templateGeneration.findMany({
      where: { userId, status: 'processing' },
      select: { id: true, status: true, createdAt: true, template: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { generations: active };
  });

export const deleteTemplateGeneration = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ generationId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const prisma = await getPrisma();
    const [{ DeleteObjectCommand }, { env }, { fileS3Key, s3Client }] = await Promise.all([
      import('@aws-sdk/client-s3'),
      import('@/libs/env'),
      import('@/libs/S3Helper'),
    ]);
    const userId = userIdFromCtx(context);
    const generation = await prisma.templateGeneration.findUnique({
      where: { id: data.generationId, userId },
      include: { resultFile: true },
    });
    if (!generation) throw new Error('Generation not found or access denied');
    if (!generation.resultFile) throw new Error('No file associated with this generation');

    const s3Key = fileS3Key(userId, generation.resultFile.url);
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: s3Key }));
    } catch (e) {
      console.error(`Failed to delete from S3: ${s3Key}`, e);
    }

    await prisma.file.update({
      where: { id: generation.resultFile.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    await prisma.templateGeneration.update({
      where: { id: data.generationId },
      data: { resultFileId: null, errorMessage: 'Image deleted by user' },
    });

    return { success: true, generationId: data.generationId, message: 'Image deleted successfully' };
  });
