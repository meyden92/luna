import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { markGenerationsSeen as markSeen } from '@/db/queries/studio';
import type { JsonValue } from '@/db/schema/json';
import { assertStudioEnabled } from '@/libs/studio/config';
import {
  cancelGeneration as cancel,
  retryGeneration as retry,
  saveOutputToFiles as save,
  submitGeneration as submit,
} from '@/libs/studio/pipeline';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

/**
 * The Studio's Generation actions. Every one refuses while the
 * Studio is off (no `FAL_KEY`).
 */

const submitPayloadSchema = z
  .object({
    modelId: z.string().min(1).optional(),
    templateId: z.string().min(1).optional(),
    values: z.record(z.string(), z.json()),
  })
  .refine((payload) => Boolean(payload.modelId) !== Boolean(payload.templateId), { message: 'Pick a Model or a Template' });

/**
 * Submits a Generation. The body is FormData: `payload` is the JSON of
 * `{ modelId | templateId, values }`, and every other part is a file named by
 * a `{ source: 'upload', key }` ref inside `values`.
 */
export const submitGeneration = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error('Expected FormData');
    const raw = data.get('payload');
    const payload = submitPayloadSchema.parse(JSON.parse(typeof raw === 'string' ? raw : 'null'));
    const uploads = new Map<string, File>();
    for (const [key, value] of data.entries() as Iterable<[string, unknown]>) {
      if (value instanceof File) uploads.set(key, value);
    }
    return { ...payload, uploads };
  })
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const target = data.templateId ? { templateId: data.templateId } : { modelId: data.modelId as string };
    return submit({ userId: userIdFromCtx(context), target, values: data.values as Record<string, JsonValue>, uploads: data.uploads });
  });

const generationIdSchema = z.object({ id: z.string().min(1) });

export const cancelGeneration = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(generationIdSchema)
  .handler(async ({ data, context }) => cancel(userIdFromCtx(context), data.id));

/** Submits a finished Generation's settings again, as a new Generation. */
export const retryGeneration = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(generationIdSchema)
  .handler(async ({ data, context }) => retry(userIdFromCtx(context), data.id));

export const saveOutputToFiles = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ outputId: z.string().min(1) }))
  .handler(async ({ data, context }) => save(userIdFromCtx(context), data.outputId));

/** Marks the User's finished Generations seen (all, or `ids`), which clears the badge. */
export const markGenerationsSeen = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ ids: z.array(z.string().min(1)).max(500).optional() }))
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    return { seen: await markSeen(userIdFromCtx(context), data.ids) };
  });
