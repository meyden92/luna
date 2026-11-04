import { and, asc, count, eq, gte, inArray, lt, notInArray, or, sql } from 'drizzle-orm';
import { type BudgetState, budgetLimit, budgetState, utcMonthStart } from '@/libs/studio/budget';
import type { FieldConfig, SchemaSnapshot, VariableConfig } from '@/libs/studio/types';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db, type Tx } from '../client';
import { generation, studioBudgetOverride, studioCategory, studioModel, studioSettings, studioTemplate } from '../schema/studio';

/**
 * Query module for the Studio's configuration: Categories, Models, Templates,
 * settings and Budgets, all audited. Generations and Outputs live in
 * `generations.ts`.
 */

export type StudioCategory = typeof studioCategory.$inferSelect;
export type StudioModel = typeof studioModel.$inferSelect;
export type StudioTemplate = typeof studioTemplate.$inferSelect;

const SETTINGS_ID = 'default';

/** What an instance without a settings row runs with. */
export const DEFAULT_STUDIO_SETTINGS = { defaultMonthlyBudgetUsd: null, maxActiveGenerationsPerUser: 3 } as const;

// ---------------------------------------------------------------------------
// Categories, Models and Templates (audited)
// ---------------------------------------------------------------------------

type CategoryValues = Pick<typeof studioCategory.$inferInsert, 'name' | 'icon' | 'sortOrder'>;

export async function createStudioCategory(values: CategoryValues, userId: string | null, handle: AuditHandle = db) {
  const [created] = await handle
    .insert(studioCategory)
    .values({ id: crypto.randomUUID(), ...values })
    .returning();
  if (!created) throw new Error('Failed to create Studio category');
  await writeAuditLog(handle, { model: 'StudioCategory', action: 'create', after: created, userId });
  return created;
}

export async function updateStudioCategory(id: string, values: Partial<CategoryValues>, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.select().from(studioCategory).where(eq(studioCategory.id, id));
  if (!before) return undefined;
  const [after] = await handle
    .update(studioCategory)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(studioCategory.id, id))
    .returning();
  if (after) await writeAuditLog(handle, { model: 'StudioCategory', action: 'update', before, after, userId });
  return after;
}

export async function getStudioCategory(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(studioCategory).where(eq(studioCategory.id, id));
  return row;
}

/** Every Category in order, with how many Models and Templates it holds. */
export async function listStudioCategories(handle: AuditHandle = db) {
  const models = handle
    .select({ categoryId: studioModel.categoryId, count: count().as('model_count') })
    .from(studioModel)
    .groupBy(studioModel.categoryId)
    .as('models');
  const templates = handle
    .select({ categoryId: studioTemplate.categoryId, count: count().as('template_count') })
    .from(studioTemplate)
    .groupBy(studioTemplate.categoryId)
    .as('templates');
  const rows = await handle
    .select({ category: studioCategory, modelCount: models.count, templateCount: templates.count })
    .from(studioCategory)
    .leftJoin(models, eq(models.categoryId, studioCategory.id))
    .leftJoin(templates, eq(templates.categoryId, studioCategory.id))
    .orderBy(asc(studioCategory.sortOrder), asc(studioCategory.createdAt));
  return rows.map(({ category, modelCount, templateCount }) => ({
    ...category,
    modelCount: modelCount ?? 0,
    templateCount: templateCount ?? 0,
  }));
}

/** Gives the Categories `ids` the sort orders 0, 1, 2…, auditing each one that moved. */
export async function reorderStudioCategories(ids: string[], userId: string | null, handle: AuditHandle = db) {
  return handle.transaction(async (tx: Tx) => {
    const current = await tx.select().from(studioCategory).where(inArray(studioCategory.id, ids));
    const orders = new Map(current.map((row) => [row.id, row.sortOrder]));
    for (const [sortOrder, id] of ids.entries()) {
      if (orders.has(id) && orders.get(id) !== sortOrder) await updateStudioCategory(id, { sortOrder }, userId, tx);
    }
  });
}

/** Fails on the foreign key while the Category still holds Models or Templates. */
export async function deleteStudioCategory(id: string, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.delete(studioCategory).where(eq(studioCategory.id, id)).returning();
  if (before) await writeAuditLog(handle, { model: 'StudioCategory', action: 'delete', before, userId });
  return before;
}

type ModelValues = Omit<typeof studioModel.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;

export async function createStudioModel(values: ModelValues, userId: string | null, handle: AuditHandle = db) {
  const [created] = await handle
    .insert(studioModel)
    .values({ id: crypto.randomUUID(), ...values })
    .returning();
  if (!created) throw new Error('Failed to create Studio model');
  await writeAuditLog(handle, { model: 'StudioModel', action: 'create', after: created, userId });
  return created;
}

export async function updateStudioModel(id: string, values: Partial<ModelValues>, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.select().from(studioModel).where(eq(studioModel.id, id));
  if (!before) return undefined;
  const [after] = await handle
    .update(studioModel)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(studioModel.id, id))
    .returning();
  if (after) await writeAuditLog(handle, { model: 'StudioModel', action: 'update', before, after, userId });
  return after;
}

/** Fails on the foreign key while Templates still use the Model. */
export async function deleteStudioModel(id: string, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.delete(studioModel).where(eq(studioModel.id, id)).returning();
  if (before) await writeAuditLog(handle, { model: 'StudioModel', action: 'delete', before, userId });
  return before;
}

type TemplateValues = Omit<typeof studioTemplate.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;

export async function createStudioTemplate(values: TemplateValues, userId: string | null, handle: AuditHandle = db) {
  const [created] = await handle
    .insert(studioTemplate)
    .values({ id: crypto.randomUUID(), ...values })
    .returning();
  if (!created) throw new Error('Failed to create Studio template');
  await writeAuditLog(handle, { model: 'StudioTemplate', action: 'create', after: created, userId });
  return created;
}

export async function updateStudioTemplate(id: string, values: Partial<TemplateValues>, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.select().from(studioTemplate).where(eq(studioTemplate.id, id));
  if (!before) return undefined;
  const [after] = await handle
    .update(studioTemplate)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(studioTemplate.id, id))
    .returning();
  if (after) await writeAuditLog(handle, { model: 'StudioTemplate', action: 'update', before, after, userId });
  return after;
}

export async function deleteStudioTemplate(id: string, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.delete(studioTemplate).where(eq(studioTemplate.id, id)).returning();
  if (before) await writeAuditLog(handle, { model: 'StudioTemplate', action: 'delete', before, userId });
  return before;
}

/** Every Model, by Category order then its own, with its Category's name. */
export async function listStudioModels(handle: AuditHandle = db) {
  const rows = await handle
    .select({ model: studioModel, categoryName: studioCategory.name })
    .from(studioModel)
    .innerJoin(studioCategory, eq(studioCategory.id, studioModel.categoryId))
    .orderBy(asc(studioCategory.sortOrder), asc(studioModel.sortOrder), asc(studioModel.createdAt));
  return rows.map(({ model, categoryName }) => ({ ...model, categoryName }));
}

export async function getStudioModel(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(studioModel).where(eq(studioModel.id, id));
  return row;
}

/** How many Models a Category holds: a new one is sorted after them. */
export async function countStudioModels(categoryId: string, handle: AuditHandle = db) {
  const [row] = await handle.select({ count: count() }).from(studioModel).where(eq(studioModel.categoryId, categoryId));
  return row?.count ?? 0;
}

/** How many Templates use a Model: it cannot be deleted while any do. */
export async function countStudioTemplatesOfModel(modelId: string, handle: AuditHandle = db) {
  const [row] = await handle.select({ count: count() }).from(studioTemplate).where(eq(studioTemplate.modelId, modelId));
  return row?.count ?? 0;
}

/** Every Template, by Category order then its own, with its Category's and Model's names. */
export async function listStudioTemplates(handle: AuditHandle = db) {
  const rows = await handle
    .select({ template: studioTemplate, categoryName: studioCategory.name, modelName: studioModel.name })
    .from(studioTemplate)
    .innerJoin(studioCategory, eq(studioCategory.id, studioTemplate.categoryId))
    .innerJoin(studioModel, eq(studioModel.id, studioTemplate.modelId))
    .orderBy(asc(studioCategory.sortOrder), asc(studioTemplate.sortOrder), asc(studioTemplate.createdAt));
  return rows.map(({ template, categoryName, modelName }) => ({ ...template, categoryName, modelName }));
}

/** Any Template, also an inactive one, with its Model. */
export async function getStudioTemplate(id: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ template: studioTemplate, model: studioModel })
    .from(studioTemplate)
    .innerJoin(studioModel, eq(studioModel.id, studioTemplate.modelId))
    .where(eq(studioTemplate.id, id));
  return row;
}

/** The Templates built on a Model, in no particular order. */
export async function listStudioTemplatesOfModel(modelId: string, handle: AuditHandle = db) {
  return handle.select().from(studioTemplate).where(eq(studioTemplate.modelId, modelId));
}

/**
 * Stores what a schema check found. `updated_at` stays, because no admin
 * edited the Model; the audit log records only a changed pending schema or
 * deprecation, not every daily check.
 */
export async function recordStudioSchemaCheck(
  id: string,
  values: { pendingSchema: SchemaSnapshot | null; deprecated: boolean; checkedAt: Date },
  handle: AuditHandle = db,
) {
  const [before] = await handle.select().from(studioModel).where(eq(studioModel.id, id));
  if (!before) return undefined;
  const [after] = await handle
    .update(studioModel)
    .set({ pendingSchema: values.pendingSchema, deprecated: values.deprecated, schemaCheckedAt: values.checkedAt })
    .where(eq(studioModel.id, id))
    .returning();
  const changed = before.deprecated !== values.deprecated || JSON.stringify(before.pendingSchema) !== JSON.stringify(values.pendingSchema);
  if (after && changed) await writeAuditLog(handle, { model: 'StudioModel', action: 'update', before, after, userId: null });
  return after;
}

/**
 * Makes a Model's pending schema its snapshot, with the reconciled Field
 * configs of the Model and of the Templates given, in one transaction.
 */
export async function applyStudioSchema(
  modelId: string,
  values: {
    schemaSnapshot: SchemaSnapshot;
    fields: FieldConfig[];
    templates: { id: string; fields: FieldConfig[]; variables: VariableConfig[] }[];
  },
  userId: string | null,
  handle: AuditHandle = db,
) {
  return handle.transaction(async (tx: Tx) => {
    const model = await updateStudioModel(
      modelId,
      { schemaSnapshot: values.schemaSnapshot, pendingSchema: null, fields: values.fields },
      userId,
      tx,
    );
    for (const { id, ...template } of values.templates) await updateStudioTemplate(id, template, userId, tx);
    return model;
  });
}

/** How many Templates a Category holds: a new one is sorted after them. */
export async function countStudioTemplates(categoryId: string, handle: AuditHandle = db) {
  const [row] = await handle.select({ count: count() }).from(studioTemplate).where(eq(studioTemplate.categoryId, categoryId));
  return row?.count ?? 0;
}

/** An active Model, as a submit target. */
export async function getActiveStudioModel(id: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select()
    .from(studioModel)
    .where(and(eq(studioModel.id, id), eq(studioModel.isActive, true)));
  return row;
}

/** An active Template with its Model, as a submit target. The Model need not be active. */
export async function getActiveStudioTemplate(id: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ template: studioTemplate, model: studioModel })
    .from(studioTemplate)
    .innerJoin(studioModel, eq(studioModel.id, studioTemplate.modelId))
    .where(and(eq(studioTemplate.id, id), eq(studioTemplate.isActive, true)));
  return row;
}

// ---------------------------------------------------------------------------
// Settings and Budgets (audited)
// ---------------------------------------------------------------------------

export async function getStudioSettings(handle: AuditHandle = db) {
  const [row] = await handle.select().from(studioSettings).where(eq(studioSettings.id, SETTINGS_ID));
  return row ?? DEFAULT_STUDIO_SETTINGS;
}

type SettingsValues = Partial<Pick<typeof studioSettings.$inferInsert, 'defaultMonthlyBudgetUsd' | 'maxActiveGenerationsPerUser'>>;

/** Writes the single settings row, creating it on first use. */
export async function updateStudioSettings(values: SettingsValues, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.select().from(studioSettings).where(eq(studioSettings.id, SETTINGS_ID));
  if (!before) {
    const [created] = await handle
      .insert(studioSettings)
      .values({ id: SETTINGS_ID, ...values })
      .returning();
    if (!created) throw new Error('Failed to create Studio settings');
    await writeAuditLog(handle, { model: 'StudioSettings', action: 'create', after: created, userId });
    return created;
  }
  const [after] = await handle
    .update(studioSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(studioSettings.id, SETTINGS_ID))
    .returning();
  if (after) await writeAuditLog(handle, { model: 'StudioSettings', action: 'update', before, after, userId });
  return after;
}

/** The override's audit snapshot: keyed by the User it applies to. */
const overrideRecord = (row: typeof studioBudgetOverride.$inferSelect) => ({ id: row.userId, ...row });

/** Sets a User's own monthly Budget; null means unlimited. */
export async function setStudioBudgetOverride(
  targetUserId: string,
  monthlyBudgetUsd: number | null,
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [before] = await handle.select().from(studioBudgetOverride).where(eq(studioBudgetOverride.userId, targetUserId));
  if (!before) {
    const [created] = await handle.insert(studioBudgetOverride).values({ userId: targetUserId, monthlyBudgetUsd }).returning();
    if (!created) throw new Error('Failed to create Budget override');
    await writeAuditLog(handle, { model: 'StudioBudgetOverride', action: 'create', after: overrideRecord(created), userId });
    return created;
  }
  const [after] = await handle
    .update(studioBudgetOverride)
    .set({ monthlyBudgetUsd, updatedAt: new Date() })
    .where(eq(studioBudgetOverride.userId, targetUserId))
    .returning();
  if (after) {
    await writeAuditLog(handle, {
      model: 'StudioBudgetOverride',
      action: 'update',
      before: overrideRecord(before),
      after: overrideRecord(after),
      userId,
    });
  }
  return after;
}

/** Returns a User to the default Budget. */
export async function deleteStudioBudgetOverride(targetUserId: string, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.delete(studioBudgetOverride).where(eq(studioBudgetOverride.userId, targetUserId)).returning();
  if (before) await writeAuditLog(handle, { model: 'StudioBudgetOverride', action: 'delete', before: overrideRecord(before), userId });
  return before;
}

export async function getStudioBudgetOverride(targetUserId: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(studioBudgetOverride).where(eq(studioBudgetOverride.userId, targetUserId));
  return row;
}

/**
 * What a Generation counts against the Budget: its billed cost once settled,
 * else its estimate. Failed and cancelled ones count nothing, since fal bills
 * only successful output, except a failure fal billed (`error.billed`).
 */
export const spentUsd = sql<number>`coalesce(sum(coalesce(${generation.actualCostUsd}, ${generation.estimatedCostUsd}, 0)), 0)`.mapWith(
  Number,
);
export const isSpending = or(notInArray(generation.status, ['failed', 'cancelled']), sql`(${generation.error} ->> 'billed')::boolean`);

/** A User's spend on Generations created in `[from, to)`, deleted ones included. */
export async function userSpendUsd(userId: string, from: Date, to: Date, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ spentUsd })
    .from(generation)
    .where(and(eq(generation.userId, userId), isSpending, gte(generation.createdAt, from), lt(generation.createdAt, to)));
  return row?.spentUsd ?? 0;
}

/** A User's Budget for the UTC calendar month `now` falls in. */
export async function getBudgetState(userId: string, handle: AuditHandle = db, now: Date = new Date()): Promise<BudgetState> {
  // One after another: inside admission, `handle` is a transaction on a single connection.
  const settings = await getStudioSettings(handle);
  const override = await getStudioBudgetOverride(userId, handle);
  const spent = await userSpendUsd(userId, utcMonthStart(now), utcMonthStart(now, 1), handle);
  return budgetState(budgetLimit(settings.defaultMonthlyBudgetUsd, override), spent);
}

// ---------------------------------------------------------------------------
// The Studio screen
// ---------------------------------------------------------------------------

/** Every Category in order, with its active Models and Templates in order; empty Categories are left out. */
export async function listActiveStudioCatalog(handle: AuditHandle = db) {
  const [categories, models, templates] = await Promise.all([
    handle.select().from(studioCategory).orderBy(asc(studioCategory.sortOrder), asc(studioCategory.createdAt)),
    handle.select().from(studioModel).where(eq(studioModel.isActive, true)).orderBy(asc(studioModel.sortOrder), asc(studioModel.createdAt)),
    handle
      .select({ template: studioTemplate, model: studioModel })
      .from(studioTemplate)
      .innerJoin(studioModel, eq(studioModel.id, studioTemplate.modelId))
      .where(eq(studioTemplate.isActive, true))
      .orderBy(asc(studioTemplate.sortOrder), asc(studioTemplate.createdAt)),
  ]);
  return categories
    .map((category) => ({
      category,
      models: models.filter((model) => model.categoryId === category.id),
      templates: templates.filter(({ template }) => template.categoryId === category.id),
    }))
    .filter(({ models, templates }) => models.length + templates.length > 0);
}
