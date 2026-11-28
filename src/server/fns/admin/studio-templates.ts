import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getOwnedGeneration, listGenerationOutputs } from '@/db/queries/generations';
import {
  countStudioTemplates,
  createStudioTemplate,
  deleteStudioTemplate as deleteTemplateRow,
  getStudioCategory,
  getStudioModel,
  getStudioTemplate as getTemplateRow,
  listStudioTemplates as listTemplateRows,
  updateStudioTemplate,
} from '@/db/queries/studio';
import { getPrivateSignedUrl } from '@/libs/S3Helper';
import { assertStudioEnabled } from '@/libs/studio/config';
import { readStudioFormData } from '@/libs/studio/form';
import { RequestValidationError } from '@/libs/studio/request';
import { templateFieldDefaults, templateReferenceKeys, validateTemplateConfig } from '@/libs/studio/template-config';
import {
  deleteTemplatePreviews,
  signTemplatePreviews,
  signTemplateReferences,
  storeTemplatePreviews,
  storeTemplateReferences,
} from '@/libs/studio/template-previews';
import type { FieldConfig, VariableConfig } from '@/libs/studio/types';
import { UserFacingError } from '@/libs/user-facing-error';
import { saveStudioTemplateSchema } from '@/schemas/studio-schema';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

/**
 * Admin management of Studio Templates. Every function is admin-only and
 * refuses while the Studio is off (no `FAL_KEY`).
 */

const idSchema = z.object({ id: z.string().min(1) });

export const listStudioTemplates = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    assertStudioEnabled();
    return listTemplateRows();
  });

/** A Template for its editor, with its preview and reference images signed. */
export const getStudioTemplate = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    assertStudioEnabled();
    const row = await getTemplateRow(data.id);
    if (!row) throw new UserFacingError('Template not found.');
    const [previews, references] = await Promise.all([
      signTemplatePreviews(row.template.previewKeys),
      signTemplateReferences(row.template.fields),
    ]);
    return { ...row.template, previews, references };
  });

/**
 * *Save as Template*: a new Template's starting point from one of the admin's
 * Generations: its Model, its `form_values` as fixed values and its first
 * image Output as the preview.
 */
export const getTemplateDraftFromGeneration = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ generationId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const row = await getOwnedGeneration(data.generationId, adminIdFromCtx(context));
    if (!row) throw new UserFacingError('Generation not found.');
    // Its values fill a Template's Variables, not the Model's Fields.
    if (row.fromTemplate) throw new UserFacingError('This Generation ran a Template, so it cannot become a Template.');
    const model = row.modelId ? await getStudioModel(row.modelId) : undefined;
    if (!model) throw new UserFacingError('The Model of this Generation no longer exists, so it cannot become a Template.');
    const image = (await listGenerationOutputs(row.id)).find((output) => output.mediaKind === 'image' && !output.expiredAt);
    return {
      modelId: model.id,
      categoryId: model.categoryId,
      name: row.name,
      fields: templateFieldDefaults(model.fields, model.schemaSnapshot.input, row.formValues),
      preview: image ? { outputId: image.id, url: await getPrivateSignedUrl(image.s3Key, 3600) } : null,
    };
  });

/**
 * Creates or saves a Template. FormData: `payload` is the JSON of
 * `saveStudioTemplateSchema`, and every other part a preview or reference
 * image named by its `upload` key. Refuses configs `validateTemplateConfig`
 * rejects, naming each card.
 */
export const saveStudioTemplate = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator((data: FormData) => readStudioFormData(data, (payload) => saveStudioTemplateSchema.parse(payload)))
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const adminId = adminIdFromCtx(context);
    const model = await getStudioModel(data.modelId);
    if (!model) throw new UserFacingError('Model not found.');
    if (!(await getStudioCategory(data.categoryId))) throw new UserFacingError('Category not found.');
    const existing = data.id ? await getTemplateRow(data.id) : undefined;
    if (data.id && !existing) throw new UserFacingError('Template not found.');

    const variables = data.variables as VariableConfig[];
    const issues = validateTemplateConfig({ fields: data.fields as FieldConfig[], variables, input: model.schemaSnapshot.input });
    if (issues.length > 0) {
      throw new RequestValidationError(issues.map((issue) => ({ ...issue, message: `${issue.field}: ${issue.message}` })));
    }

    const currentKeys = existing?.template.previewKeys ?? [];
    const currentReferenceKeys = templateReferenceKeys(existing?.template.fields ?? []);
    const references = await storeTemplateReferences(data.fields as FieldConfig[], {
      uploads: data.uploads,
      currentKeys: currentReferenceKeys,
    });
    const fields = references.fields;
    let previews: Awaited<ReturnType<typeof storeTemplatePreviews>>;
    try {
      previews = await storeTemplatePreviews(data.previews, { uploads: data.uploads, adminId, currentKeys });
    } catch (error) {
      await deleteTemplatePreviews(references.created);
      throw error;
    }
    const { keys } = previews;
    const created = [...previews.created, ...references.created];
    const values = {
      modelId: model.id,
      categoryId: data.categoryId,
      name: data.name,
      description: data.description?.trim() || null,
      isActive: data.isActive,
      fields,
      variables,
      previewKeys: keys,
    };

    // A new Template, or one moved to another Category, goes after the Templates already there.
    const sortOrder =
      existing?.template.categoryId === data.categoryId ? existing.template.sortOrder : await countStudioTemplates(data.categoryId);
    let saved: Awaited<ReturnType<typeof createStudioTemplate>> | undefined;
    try {
      saved = existing
        ? await updateStudioTemplate(existing.template.id, { ...values, sortOrder }, adminId)
        : await createStudioTemplate({ ...values, createdBy: adminId, sortOrder }, adminId);
    } catch (error) {
      await deleteTemplatePreviews(created);
      throw error;
    }
    if (!saved) throw new UserFacingError('Template not found.');
    const referenceKeys = templateReferenceKeys(fields);
    await deleteTemplatePreviews([
      ...currentKeys.filter((key) => !keys.includes(key)),
      ...currentReferenceKeys.filter((key) => !referenceKeys.includes(key)),
    ]);
    return saved;
  });

/** Deletes a Template and its preview and reference images. Its Generations stay in their Users' history. */
export const deleteStudioTemplate = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const deleted = await deleteTemplateRow(data.id, adminIdFromCtx(context));
    if (!deleted) throw new UserFacingError('Template not found.');
    await deleteTemplatePreviews([...deleted.previewKeys, ...templateReferenceKeys(deleted.fields)]);
  });
