import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import * as ai from '@/db/queries/ai';
import type { JsonValue } from '@/db/schema/json';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export interface ImagePresetDTO {
  id: string;
  name: string;
  modelId: string;
  fieldValues: JsonValue;
  createdAt: string;
}

export const listImagePresets = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ modelId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const rows = await ai.listImagePresets(userId, data.modelId);
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
    const userId = userIdFromCtx(context);
    const row = await ai.createImagePreset(
      { ownerId: userId, modelId: data.modelId, name: data.name, fieldValues: data.fieldValues as JsonValue },
      userId,
    );
    return { id: row.id };
  });

export const deleteImagePreset = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    await ai.deleteImagePreset(data.id, userId, userId);
    return { success: true };
  });
