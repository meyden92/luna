import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createFormShare as createFormShareRow, listOwnedFormShares, softDeleteOwnedFormShare } from '@/db/queries/features';
import { createFormShareSchema } from '@/schemas/form-share-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const listFormShares = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => listOwnedFormShares(userIdFromCtx(context)));

export const createFormShare = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createFormShareSchema)
  .handler(async ({ data, context }) => {
    const { encryptFieldValue } = await import('@/libs/encryption/field-encryption');
    const userId = userIdFromCtx(context);
    const share = await createFormShareRow(
      {
        title: data.title || null,
        expiresInMs: data.expiresInMs || null,
        maxViews: data.maxViews || null,
        ownerId: userId,
        fields: data.fields.map((field) => ({
          label: field.label,
          value: field.isSensitive ? encryptFieldValue(field.value) : field.value,
          type: field.type,
          isSensitive: field.isSensitive,
        })),
      },
      userId,
    );
    return { id: share.id };
  });

const deleteFormShareSchema = z.object({ id: z.string().min(1) });

export const deleteFormShare = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(deleteFormShareSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const deleted = await softDeleteOwnedFormShare({ id: data.id, ownerId: userId }, userId);
    if (!deleted) throw new Error('Form share not found');
    return { success: true };
  });
