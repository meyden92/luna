import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  applyStudioSchema,
  countStudioModels,
  countStudioTemplatesOfModel,
  createStudioCategory as createCategoryRow,
  createStudioModel,
  deleteStudioCategory as deleteCategoryRow,
  deleteStudioModel as deleteModelRow,
  getStudioModel as getModelRow,
  getStudioCategory,
  listStudioCategories as listCategoryRows,
  listStudioModels as listModelRows,
  listStudioTemplatesOfModel as listTemplatesOfModel,
  reorderStudioCategories as reorderCategoryRows,
  type StudioModel,
  updateStudioCategory as updateCategoryRow,
  updateStudioModel as updateModelRow,
} from '@/db/queries/studio';
import type { JsonValue } from '@/db/schema/json';
import { assertStudioEnabled, falClient } from '@/libs/studio/config';
import { readStudioFormData } from '@/libs/studio/form';
import { countOf } from '@/libs/studio/format';
import {
  CATALOG_CATEGORIES,
  defaultFieldConfigs,
  isOfferedCategory,
  suggestPricing,
  validateModelConfig,
} from '@/libs/studio/model-config';
import { resolveOpenapiSchemas } from '@/libs/studio/openapi';
import { submitGeneration } from '@/libs/studio/pipeline';
import { type RequestIssue, RequestValidationError } from '@/libs/studio/request';
import { isApplyRefused, planSchemaApply, type SchemaApplyPlan } from '@/libs/studio/schema-apply';
import { checkStudioSchemas } from '@/libs/studio/schema-check';
import { validateTemplateConfig } from '@/libs/studio/template-config';
import type { FieldConfig, VariableConfig } from '@/libs/studio/types';
import { UserFacingError } from '@/libs/user-facing-error';
import { fieldConfigSchema, studioCategorySchema, updateStudioModelSchema, variableConfigSchema } from '@/schemas/studio-schema';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

/**
 * Admin management of Studio Categories and Models. Every function is
 * admin-only and refuses while the Studio is off (no `FAL_KEY`).
 */

const idSchema = z.object({ id: z.string().min(1) });

/** Refuses Field configs `validateModelConfig` found issues with, naming each Field. */
function assertValidConfig(issues: RequestIssue[]): void {
  if (issues.length > 0)
    throw new RequestValidationError(issues.map((issue) => ({ ...issue, message: `${issue.field}: ${issue.message}` })));
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const listStudioCategories = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    assertStudioEnabled();
    return listCategoryRows();
  });

export const createStudioCategory = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(studioCategorySchema)
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const sortOrder = (await listCategoryRows()).length;
    return createCategoryRow({ ...data, sortOrder }, adminIdFromCtx(context));
  });

export const updateStudioCategory = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(studioCategorySchema.extend(idSchema.shape))
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const { id, ...values } = data;
    const updated = await updateCategoryRow(id, values, adminIdFromCtx(context));
    if (!updated) throw new UserFacingError('Category not found.');
    return updated;
  });

/** Saves the order the admin dragged the Categories into. */
export const reorderStudioCategories = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ ids: z.array(z.string().min(1)).max(500) }))
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    await reorderCategoryRows(data.ids, adminIdFromCtx(context));
  });

/** Refuses while the Category still holds Models or Templates. */
export const deleteStudioCategory = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const category = (await listCategoryRows()).find((row) => row.id === data.id);
    if (!category) throw new UserFacingError('Category not found.');
    if (category.modelCount + category.templateCount > 0) {
      throw new UserFacingError(
        `${category.name} still holds ${countOf(category.modelCount, 'Model')} and ${countOf(category.templateCount, 'Template')}. Move or delete them first.`,
      );
    }
    await deleteCategoryRow(data.id, adminIdFromCtx(context));
  });

// ---------------------------------------------------------------------------
// The fal catalog
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  endpointId: string;
  displayName: string;
  category: string;
  description: string;
  thumbnailUrl: string | null;
  price: { unit: string; unitPrice: number; currency: string } | null;
}

const CATALOG_PAGE_SIZE = 20;

/** Searches fal's active Models, leaving out the categories whose Models answer with text. */
export const searchStudioCatalog = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(
    z.object({
      q: z.string().max(200).optional(),
      category: z.enum(CATALOG_CATEGORIES).optional(),
      cursor: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ entries: CatalogEntry[]; nextCursor: string | null }> => {
    assertStudioEnabled();
    const fal = falClient();
    const page = await fal.platform.models({
      q: data.q?.trim() || undefined,
      category: data.category,
      cursor: data.cursor,
      status: 'active',
      limit: CATALOG_PAGE_SIZE,
    });
    const models = page.models.filter((model) => isOfferedCategory(model.category));
    const prices = new Map((await fal.platform.pricing(models.map((model) => model.endpointId))).map((price) => [price.endpointId, price]));
    return {
      entries: models.map((model) => {
        const price = prices.get(model.endpointId);
        return {
          endpointId: model.endpointId,
          displayName: model.displayName,
          category: model.category,
          description: model.description,
          thumbnailUrl: model.thumbnailUrl,
          price: price ? { unit: price.unit, unitPrice: price.unitPrice, currency: price.currency } : null,
        };
      }),
      nextCursor: page.hasMore ? page.nextCursor : null,
    };
  });

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const listStudioModels = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    assertStudioEnabled();
    return listModelRows();
  });

/** A Model with `drift`: what applying fal's pending schema would do, or null while there is none. */
export const getStudioModel = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    assertStudioEnabled();
    const model = await getModelRow(data.id);
    if (!model) throw new UserFacingError('Model not found.');
    return { ...model, drift: await schemaApplyPlan(model) };
  });

async function schemaApplyPlan(model: StudioModel): Promise<SchemaApplyPlan | null> {
  if (!model.pendingSchema) return null;
  return planSchemaApply({
    before: model.schemaSnapshot.input,
    after: model.pendingSchema.input,
    model,
    templates: await listTemplatesOfModel(model.id),
  });
}

/** *Check now*: runs the schema drift check for one Model. */
export const checkStudioModelSchema = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    assertStudioEnabled();
    const result = await checkStudioSchemas({ modelIds: [data.id] });
    if (result.checked === 0 && result.missing.length > 0) throw new UserFacingError('fal no longer lists this endpoint.');
    if (result.failed[0]) throw new UserFacingError(`fal's schema could not be read: ${result.failed[0].message}`);
    return { drifted: result.drifted > 0 };
  });

/**
 * *Apply*: makes fal's pending schema the Model's snapshot and reconciles the
 * Field configs of the Model and its Templates. Refuses, naming each issue,
 * while the result would be invalid, such as a fixed value the new schema
 * no longer allows.
 */
export const applyStudioModelSchema = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const model = await getModelRow(data.id);
    if (!model) throw new UserFacingError('Model not found.');
    const plan = await schemaApplyPlan(model);
    if (!model.pendingSchema || !plan) throw new UserFacingError("This Model's schema has no pending changes.");
    if (isApplyRefused(plan)) {
      throw new RequestValidationError([
        ...plan.model.issues.map((issue) => ({ ...issue, message: `${issue.field}: ${issue.message}` })),
        ...plan.templates.flatMap((template) =>
          template.issues.map((issue) => ({ ...issue, message: `${template.name}, ${issue.field}: ${issue.message}` })),
        ),
      ]);
    }
    const before = new Map((await listTemplatesOfModel(model.id)).map((template) => [template.id, template]));
    const changed = plan.templates.filter((template) => {
      const old = before.get(template.id);
      return JSON.stringify([old?.fields, old?.variables]) !== JSON.stringify([template.fields, template.variables]);
    });
    await applyStudioSchema(
      model.id,
      {
        schemaSnapshot: model.pendingSchema,
        fields: plan.model.fields,
        templates: changed.map(({ id, fields, variables }) => ({ id, fields, variables })),
      },
      adminIdFromCtx(context),
    );
  });

/**
 * Adds a fal endpoint as a Model: snapshots its schemas, derives the default
 * Field cards and suggests the pricing quantity. The same endpoint may be
 * added any number of times.
 */
export const addStudioModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ endpointId: z.string().min(1).max(200), categoryId: z.string().min(1), name: z.string().trim().min(1).max(120) }))
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    if (!(await getStudioCategory(data.categoryId))) throw new UserFacingError('Category not found.');
    const fal = falClient();
    const [found] = (await fal.platform.models({ endpointIds: [data.endpointId], expandOpenapi: true })).models;
    if (!found?.openapi) throw new UserFacingError(`fal does not know ${data.endpointId}.`);
    if (!isOfferedCategory(found.category)) throw new UserFacingError('Models that answer with text cannot be added to the Studio.');

    const schemaSnapshot = resolveOpenapiSchemas(found.openapi, data.endpointId);
    const [price] = await fal.platform.pricing([data.endpointId]);
    return createStudioModel(
      {
        categoryId: data.categoryId,
        endpointId: data.endpointId,
        name: data.name,
        description: found.description || null,
        isActive: true,
        sortOrder: await countStudioModels(data.categoryId),
        schemaSnapshot,
        schemaCheckedAt: new Date(),
        deprecated: found.status === 'deprecated',
        fields: defaultFieldConfigs(schemaSnapshot.input),
        pricing: price ? suggestPricing(price, schemaSnapshot.input) : null,
      },
      adminIdFromCtx(context),
    );
  });

/** Saves the Model editor; refuses Field configs and pricing that `validateModelConfig` rejects. */
export const updateStudioModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(updateStudioModelSchema)
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const model = await getModelRow(data.id);
    if (!model) throw new UserFacingError('Model not found.');
    if (!(await getStudioCategory(data.categoryId))) throw new UserFacingError('Category not found.');
    const pricing = model.pricing && data.quantity ? { ...model.pricing, quantity: data.quantity } : model.pricing;
    const fields = data.fields as FieldConfig[];
    assertValidConfig(validateModelConfig(fields, model.schemaSnapshot.input, pricing));

    const { id, quantity: _quantity, ...values } = data;
    return updateModelRow(id, { ...values, fields, pricing }, adminIdFromCtx(context));
  });

/** Refuses while Templates use the Model. Its Generations stay in their Users' history. */
export const deleteStudioModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(idSchema)
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const templates = await countStudioTemplatesOfModel(data.id);
    if (templates > 0) throw new UserFacingError(`This Model is used by ${countOf(templates, 'Template')}. Delete them first.`);
    await deleteModelRow(data.id, adminIdFromCtx(context));
  });

const testPayloadSchema = z.object({
  modelId: z.string().min(1),
  fields: z.array(fieldConfigSchema),
  /** Set by the Template editor, even when empty: the draft is a Template's. */
  variables: z.array(variableConfigSchema).max(50).optional(),
  values: z.record(z.string(), z.json()),
});

/**
 * Runs the Model or Template editor's preview as a real Generation of the
 * admin's, with the editor's unsaved Fields and Variables: the normal
 * pipeline and Budget, also for an inactive Model. FormData as written by
 * `studioFormData`.
 */
export const testStudioModel = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator((data: FormData) => readStudioFormData(data, (payload) => testPayloadSchema.parse(payload)))
  .handler(async ({ data, context }) => {
    assertStudioEnabled();
    const model = await getModelRow(data.modelId);
    if (!model) throw new UserFacingError('Model not found.');
    const fields = data.fields as FieldConfig[];
    const variables = data.variables as VariableConfig[] | undefined;
    const input = model.schemaSnapshot.input;
    assertValidConfig(variables ? validateTemplateConfig({ fields, variables, input }) : validateModelConfig(fields, input));
    return submitGeneration({
      userId: adminIdFromCtx(context),
      target: { draft: { modelId: model.id, fields, variables } },
      values: data.values as Record<string, JsonValue>,
      uploads: data.uploads,
    });
  });
