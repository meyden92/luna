import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  countUnseenGenerations,
  getBudgetState,
  getOwnedGeneration,
  listActiveStudioCatalog,
  listGenerationOutputs,
  listOwnGenerations,
  markGenerationsSeen as markSeen,
} from '@/db/queries/studio';
import type { JsonValue } from '@/db/schema/json';
import { getPrivateSignedUrl } from '@/libs/S3Helper';
import type { StudioCatalogCategory } from '@/libs/studio/catalog';
import { assertStudioEnabled, isStudioEnabled } from '@/libs/studio/config';
import { readStudioFormData } from '@/libs/studio/form';
import {
  cancelGeneration as cancel,
  generationSettings,
  outputDownloadUrl,
  deleteGeneration as remove,
  retryGeneration as retry,
  saveOutputToFiles as save,
  submitGeneration as submit,
} from '@/libs/studio/pipeline';
import { MEDIA_KINDS } from '@/libs/studio/types';
import { type GenerationView, toGenerationView } from '@/libs/studio/views';
import { UserFacingError } from '@/libs/user-facing-error';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

/**
 * The Studio's Generation actions. Every one but `getStudioStatus`
 * refuses while the Studio is off (no `FAL_KEY`).
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
  .validator((data: FormData) => readStudioFormData(data, (payload) => submitPayloadSchema.parse(payload)))
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const target = data.templateId ? { templateId: data.templateId } : { modelId: data.modelId as string };
    return submit({ userId: userIdFromCtx(context), target, values: data.values as Record<string, JsonValue>, uploads: data.uploads });
  });

/** Whether this instance runs the Studio, for the screens that show or hide it. */
export const getStudioStatus = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async () => ({ enabled: isStudioEnabled() }));

const generationIdSchema = z.object({ id: z.string().min(1) });

/** One of the User's Generations, with its Outputs. */
export const getGeneration = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(generationIdSchema)
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const row = await getOwnedGeneration(data.id, userIdFromCtx(context));
    if (!row) throw new UserFacingError('Generation not found.');
    return toGenerationView(row, await listGenerationOutputs(row.id));
  });

export const cancelGeneration = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(generationIdSchema)
  .handler(async ({ data, context }) => cancel(userIdFromCtx(context), data.id));

/** Submits a finished Generation's settings again, as a new Generation; `reseed` (*Again*) draws a new seed. */
export const retryGeneration = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(generationIdSchema.extend({ reseed: z.boolean().optional() }))
  .handler(async ({ data, context }) => retry(userIdFromCtx(context), data.id, { reseed: data.reseed }));

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

const STUDIO_PREVIEW_URL_TTL_SECONDS = 3600;

/** The Categories with their active Models and Templates, as the Studio screen offers them. */
export const getStudioCatalog = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async (): Promise<StudioCatalogCategory[]> => {
    assertStudioEnabled();
    const catalog = await listActiveStudioCatalog();
    return Promise.all(
      catalog.map(async ({ category, models, templates }) => ({
        id: category.id,
        name: category.name,
        icon: category.icon,
        entries: [
          ...models.map((model) => ({
            kind: 'model' as const,
            id: model.id,
            name: model.name,
            description: model.description,
            categoryId: category.id,
            fields: model.fields,
            variables: [],
            schema: model.schemaSnapshot.input,
            pricing: model.pricing,
            previewUrls: [],
          })),
          ...(await Promise.all(
            templates.map(async ({ template, model }) => ({
              kind: 'template' as const,
              id: template.id,
              name: template.name,
              description: template.description,
              categoryId: category.id,
              fields: template.fields,
              variables: template.variables,
              schema: model.schemaSnapshot.input,
              pricing: model.pricing,
              previewUrls: await Promise.all(template.previewKeys.map((key) => getPrivateSignedUrl(key, STUDIO_PREVIEW_URL_TTL_SECONDS))),
            })),
          )),
        ],
      })),
    );
  });

const HISTORY_PAGE_SIZE = 20;

/** One page of the User's history, newest first; `nextCursor` continues it. */
export const listGenerations = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(
    z.object({
      categoryId: z.string().min(1).optional(),
      mediaKinds: z.array(z.enum(MEDIA_KINDS as [string, ...string[]])).optional(),
      cursor: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<{ generations: GenerationView[]; nextCursor: string | null }> => {
    assertStudioEnabled();
    const entries = await listOwnGenerations(userIdFromCtx(context), {
      categoryId: data.categoryId,
      mediaKinds: data.mediaKinds as (typeof MEDIA_KINDS)[number][] | undefined,
      cursor: data.cursor,
      limit: HISTORY_PAGE_SIZE,
    });
    const generations = await Promise.all(entries.map(({ row, outputs }) => toGenerationView(row, outputs)));
    const last = generations.at(-1);
    return {
      generations,
      nextCursor: last && generations.length === HISTORY_PAGE_SIZE ? last.id : null,
    };
  });

/** The User's Budget this month, shown next to *Generate*. */
export const getStudioBudget = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    assertStudioEnabled();
    return getBudgetState(userIdFromCtx(context));
  });

/** How many finished Generations the User has not seen: the Studio nav badge. */
export const getUnseenGenerationCount = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    assertStudioEnabled();
    return { count: await countUnseenGenerations(userIdFromCtx(context)) };
  });

/** *Use settings*: the Generation's Model or Template and the values to fill its form with. */
export const getGenerationSettings = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(generationIdSchema)
  .handler(async ({ data, context }) => generationSettings(userIdFromCtx(context), data.id));

export const deleteGeneration = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(generationIdSchema)
  .handler(async ({ data, context }) => {
    await remove(userIdFromCtx(context), data.id);
    return { deleted: true };
  });

export const getOutputDownloadUrl = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(z.object({ outputId: z.string().min(1) }))
  .handler(async ({ data, context }) => ({ url: await outputDownloadUrl(userIdFromCtx(context), data.outputId) }));
