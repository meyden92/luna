import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { detectLanguage } from '@/libs/language-detection';
import { createBinSchema, updateBinSchema } from '@/schemas/bin-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const listBins = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    return prisma.snippet.findMany({
      where: { ownerId: userIdFromCtx(context), isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  });

const binIdSchema = z.object({ id: z.string().min(1) });

export const getBin = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(binIdSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const bin = await prisma.snippet.findFirst({
      where: { id: data.id, ownerId: userIdFromCtx(context), isDeleted: false },
    });
    if (!bin) throw new Error('Bin not found');
    return bin;
  });

export const createBin = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createBinSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const language = data.language && data.language !== 'auto' ? data.language : detectLanguage(data.snippet);
    return prisma.snippet.create({
      data: {
        title: data.title,
        content: data.snippet,
        language,
        ownerId: userIdFromCtx(context),
        isPublic: data.isPublic,
      },
    });
  });

export const updateBin = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateBinSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const language = data.language && data.language !== 'auto' ? data.language : detectLanguage(data.content);
    return prisma.snippet.update({
      where: { id: data.id, ownerId: userIdFromCtx(context) },
      data: { title: data.title, content: data.content, language, ...(data.isPublic !== undefined ? { isPublic: data.isPublic } : {}) },
    });
  });

export const deleteBin = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(binIdSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    return prisma.snippet.delete({
      where: { id: data.id, ownerId: userIdFromCtx(context) },
    });
  });
