import type { Prisma } from '@db/client';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export interface ImagePresetDTO {
  id: string;
  name: string;
  modelId: string;
  fieldValues: Prisma.JsonValue;
  createdAt: string;
}

export const listImagePresets = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ modelId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const rows = await prisma.imagePreset.findMany({
      where: { userId, modelId: data.modelId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(
      (r): ImagePresetDTO => ({
        id: r.id,
        name: r.name,
        modelId: r.modelId,
        fieldValues: r.fieldValues,
        createdAt: r.createdAt.toISOString(),
      }),
    );
  });

export const createImagePreset = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(
    z.object({
      modelId: z.string().min(1),
      name: z.string().min(1).max(100),
      fieldValues: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const row = await prisma.imagePreset.create({
      data: {
        userId,
        modelId: data.modelId,
        name: data.name,
        fieldValues: data.fieldValues as Prisma.InputJsonValue,
      },
    });
    return { id: row.id };
  });

export const deleteImagePreset = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    await prisma.imagePreset.deleteMany({ where: { id: data.id, userId } });
    return { success: true };
  });
