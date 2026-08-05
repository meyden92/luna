import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createFormShareSchema } from '@/schemas/form-share-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const listFormShares = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    return prisma.formShare.findMany({
      where: { ownerId: userIdFromCtx(context), isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        expiresAt: true,
        expiresInMs: true,
        maxViews: true,
        viewCount: true,
        createdAt: true,
        _count: { select: { fields: true } },
      },
    });
  });

export const createFormShare = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createFormShareSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const { encryptFieldValue } = await import('@/libs/encryption/field-encryption');
    const userId = userIdFromCtx(context);
    const formShare = await prisma.formShare.create({
      data: {
        title: data.title || null,
        expiresInMs: data.expiresInMs || null,
        maxViews: data.maxViews || null,
        ownerId: userId,
        fields: {
          create: data.fields.map((field, idx) => ({
            label: field.label,
            value: field.isSensitive ? encryptFieldValue(field.value) : field.value,
            type: field.type,
            isSensitive: field.isSensitive,
            sortOrder: idx,
          })),
        },
      },
    });
    return { id: formShare.id };
  });

const deleteFormShareSchema = z.object({ id: z.string().min(1) });

export const deleteFormShare = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(deleteFormShareSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    await prisma.formShare.update({
      where: { id: data.id, ownerId: userIdFromCtx(context) },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return { success: true };
  });
