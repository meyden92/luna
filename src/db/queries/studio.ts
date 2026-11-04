import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from 'drizzle-orm';
import { evaluateQuota, StorageQuotaExceededError } from '@/libs/storage-quota';
import { type BudgetState, budgetLimit, budgetRefusal, budgetState, utcMonthStart } from '@/libs/studio/budget';
import type { GenerationError, GenerationProgress, MediaKind } from '@/libs/studio/types';
import { UserFacingError } from '@/libs/user-facing-error';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db, type Tx } from '../client';
import {
  generation,
  generationOutput,
  studioBudgetOverride,
  studioCategory,
  studioModel,
  studioSettings,
  studioTemplate,
} from '../schema/studio';
import { createGeneratedFile, storageUsage } from './files';
import { lockUserStorageQuota } from './storage';

/**
 * Query module for the Studio.
 *
 * Category, Model, Template, settings and Budget override writes are audited.
 * Generation and Output writes are deliberately not: their prompts and media
 * are private to the User (see UNAUDITED_MODELS).
 */

export type StudioCategory = typeof studioCategory.$inferSelect;
export type StudioModel = typeof studioModel.$inferSelect;
export type StudioTemplate = typeof studioTemplate.$inferSelect;
export type Generation = typeof generation.$inferSelect;
export type GenerationOutput = typeof generationOutput.$inferSelect;

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
 * else its estimate. Failed and cancelled ones count nothing; fal bills only
 * successful output.
 */
export const spentUsd = sql<number>`coalesce(sum(coalesce(${generation.actualCostUsd}, ${generation.estimatedCostUsd}, 0)), 0)`.mapWith(
  Number,
);
export const isSpending = notInArray(generation.status, ['failed', 'cancelled']);

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
// Generations and Outputs (not audited: private to the User)
// ---------------------------------------------------------------------------

type NewGeneration = Pick<
  typeof generation.$inferInsert,
  'userId' | 'modelId' | 'templateId' | 'name' | 'endpointId' | 'formValues' | 'estimatedCostUsd'
>;

/**
 * Admits and records a Generation as `queued`, in one transaction: the active
 * limit, the storage quota and the Budget are checked under the User's row
 * lock, so concurrent submits cannot all slip under a limit. Throws a
 * `UserFacingError` naming the limit that refused it.
 */
export async function admitGeneration(values: NewGeneration, handle: AuditHandle = db): Promise<Generation> {
  return handle.transaction(async (tx: Tx) => {
    const quotaMiB = await lockUserStorageQuota(values.userId, tx);

    const { maxActiveGenerationsPerUser } = await getStudioSettings(tx);
    const [active] = await tx
      .select({ count: count() })
      .from(generation)
      .where(and(eq(generation.userId, values.userId), inArray(generation.status, ['queued', 'running'])));
    if ((active?.count ?? 0) >= maxActiveGenerationsPerUser) {
      throw new UserFacingError(
        `You already have ${maxActiveGenerationsPerUser} Generations running. Wait for one to finish, or cancel one.`,
        'StudioActiveLimitError',
      );
    }

    const { totalBytes } = await storageUsage(values.userId, tx);
    try {
      // One byte: a User exactly at the quota has no room for any Output.
      evaluateQuota(quotaMiB, totalBytes, 1);
    } catch (error) {
      if (!(error instanceof StorageQuotaExceededError)) throw error;
      throw new UserFacingError(
        'Your storage is full. Delete files or let unsaved Outputs expire before generating again.',
        'StudioQuotaError',
      );
    }

    const refusal = budgetRefusal(await getBudgetState(values.userId, tx), values.estimatedCostUsd ?? null);
    if (refusal) throw new UserFacingError(refusal, 'StudioBudgetError');

    const [created] = await tx
      .insert(generation)
      .values({ id: crypto.randomUUID(), ...values, status: 'queued' })
      .returning();
    if (!created) throw new Error('Failed to record Generation');
    return created;
  });
}

export async function getGeneration(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(generation).where(eq(generation.id, id));
  return row;
}

/** One of the User's Generations, unless they deleted it. */
export async function getOwnedGeneration(id: string, userId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select()
    .from(generation)
    .where(and(eq(generation.id, id), eq(generation.userId, userId), isNull(generation.deletedAt)));
  return row;
}

export async function getGenerationByRequestId(falRequestId: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(generation).where(eq(generation.falRequestId, falRequestId));
  return row;
}

/** Records fal's request after submission. Leaves the status alone. */
export async function setGenerationSubmitted(
  id: string,
  values: Pick<Generation, 'falRequestId' | 'statusUrl' | 'responseUrl' | 'cancelUrl' | 'requestInput' | 'formValues' | 'progress'>,
  handle: AuditHandle = db,
) {
  const [row] = await handle.update(generation).set(values).where(eq(generation.id, id)).returning();
  return row;
}

/** Moves a waiting Generation along; does nothing once it is finished or cancelled. */
export async function updateGenerationProgress(
  id: string,
  values: { status: 'queued' | 'running'; progress: GenerationProgress | null; startedAt?: Date },
  handle: AuditHandle = db,
) {
  const [row] = await handle
    .update(generation)
    .set(values)
    .where(and(eq(generation.id, id), inArray(generation.status, ['queued', 'running'])))
    .returning();
  return row;
}

/**
 * Generations the poller must check: submitted and waiting or running, and
 * cancelled ones whose request fal may still finish. `createdBefore` limits it
 * to older ones, when webhooks deliver the rest.
 */
export async function listGenerationsToPoll(createdBefore: Date | null, handle: AuditHandle = db) {
  return handle
    .select()
    .from(generation)
    .where(
      and(
        isNotNull(generation.falRequestId),
        or(inArray(generation.status, ['queued', 'running']), and(eq(generation.status, 'cancelled'), isNull(generation.completedAt))),
        createdBefore ? lt(generation.createdAt, createdBefore) : undefined,
      ),
    )
    .orderBy(asc(generation.createdAt));
}

/**
 * Fails Generations recorded but never submitted to fal before `before`: the
 * server stopped between admission and submission.
 */
export async function failUnsubmittedGenerations(before: Date, handle: AuditHandle = db) {
  return handle
    .update(generation)
    .set({ status: 'failed', error: { message: 'The Generation was interrupted before it reached fal.' }, completedAt: new Date() })
    .where(and(eq(generation.status, 'queued'), isNull(generation.falRequestId), lt(generation.createdAt, before)))
    .returning();
}

export interface StoredOutput {
  index: number;
  mediaKind: MediaKind;
  contentType: string;
  s3Key: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  expiresAt: Date;
}

/**
 * Finishes a Generation exactly once, under a row lock. Success records the
 * Outputs, also for a cancelled Generation whose result arrived anyway. A
 * failure marks it failed, except a cancelled one, which stays cancelled.
 * Returns the finished row, or undefined when it was already finished.
 */
export async function completeGeneration(
  id: string,
  outcome: { status: 'succeeded'; outputs: StoredOutput[] } | { status: 'failed'; error: GenerationError },
  handle: AuditHandle = db,
): Promise<Generation | undefined> {
  return handle.transaction(async (tx: Tx) => {
    const [current] = await tx.select().from(generation).where(eq(generation.id, id)).for('update');
    if (!current || current.status === 'succeeded' || current.status === 'failed' || current.completedAt) return undefined;

    const completedAt = new Date();
    if (outcome.status === 'failed') {
      const status = current.status === 'cancelled' ? 'cancelled' : 'failed';
      const [row] = await tx
        .update(generation)
        .set({ status, error: status === 'failed' ? outcome.error : null, progress: null, completedAt })
        .where(eq(generation.id, id))
        .returning();
      return row;
    }

    if (outcome.outputs.length > 0) {
      await tx.insert(generationOutput).values(outcome.outputs.map((output) => ({ id: crypto.randomUUID(), generationId: id, ...output })));
    }
    const [row] = await tx
      .update(generation)
      .set({ status: 'succeeded', error: null, progress: null, completedAt, startedAt: current.startedAt ?? completedAt })
      .where(eq(generation.id, id))
      .returning();
    return row;
  });
}

/**
 * Cancels a waiting or running Generation. `final` is false while fal may
 * still finish the request, so the poller keeps watching it.
 */
export async function markGenerationCancelled(id: string, final: boolean, handle: AuditHandle = db) {
  const [row] = await handle
    .update(generation)
    .set({ status: 'cancelled', progress: null, completedAt: final ? new Date() : null })
    .where(and(eq(generation.id, id), inArray(generation.status, ['queued', 'running'])))
    .returning();
  return row;
}

/** Marks the User's finished Generations seen: all of them, or the given ones. */
export async function markGenerationsSeen(userId: string, ids: string[] | undefined, handle: AuditHandle = db) {
  const rows = await handle
    .update(generation)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(generation.userId, userId),
        isNull(generation.seenAt),
        inArray(generation.status, ['succeeded', 'failed', 'cancelled']),
        ids ? inArray(generation.id, ids) : undefined,
      ),
    )
    .returning({ id: generation.id });
  return rows.length;
}

/**
 * Finished Generations whose cost is not settled yet, by id after `afterId`:
 * successes, failures and cancellations fal can no longer finish.
 */
export async function listUnsettledGenerations(afterId: string | null, limit: number, handle: AuditHandle = db) {
  return handle
    .select({
      id: generation.id,
      falRequestId: generation.falRequestId,
      status: generation.status,
      estimatedCostUsd: generation.estimatedCostUsd,
      completedAt: generation.completedAt,
    })
    .from(generation)
    .where(
      and(
        isNull(generation.costSettledAt),
        inArray(generation.status, ['succeeded', 'failed', 'cancelled']),
        isNotNull(generation.completedAt),
        afterId ? gt(generation.id, afterId) : undefined,
      ),
    )
    .orderBy(asc(generation.id))
    .limit(limit);
}

/** Books actual costs; a Generation settled meanwhile keeps its cost. Returns how many were settled. */
export async function settleGenerationCosts(costs: { id: string; actualCostUsd: number }[], now: Date, handle: AuditHandle = db) {
  if (costs.length === 0) return 0;
  return handle.transaction(async (tx: Tx) => {
    let settled = 0;
    for (const { id, actualCostUsd } of costs) {
      const rows = await tx
        .update(generation)
        .set({ actualCostUsd, costSettledAt: now })
        .where(and(eq(generation.id, id), isNull(generation.costSettledAt)))
        .returning({ id: generation.id });
      settled += rows.length;
    }
    return settled;
  });
}

export async function listGenerationOutputs(generationId: string, handle: AuditHandle = db) {
  return handle.select().from(generationOutput).where(eq(generationOutput.generationId, generationId)).orderBy(asc(generationOutput.index));
}

/** An Output of one of the User's Generations, with that Generation's name. */
export async function getOwnedOutput(outputId: string, userId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ output: generationOutput, generationName: generation.name })
    .from(generationOutput)
    .innerJoin(generation, eq(generation.id, generationOutput.generationId))
    .where(and(eq(generationOutput.id, outputId), eq(generation.userId, userId)));
  return row;
}

/** Outputs past their expiry whose objects still exist and that were never saved. */
export async function listExpiredOutputs(now: Date, limit: number, handle: AuditHandle = db) {
  return handle
    .select({ id: generationOutput.id, s3Key: generationOutput.s3Key })
    .from(generationOutput)
    .where(and(lte(generationOutput.expiresAt, now), isNull(generationOutput.expiredAt), isNull(generationOutput.savedFileId)))
    .limit(limit);
}

/** Records that the Outputs' objects are gone. The rows stay for the history. */
export async function markOutputsExpired(ids: string[], now: Date, handle: AuditHandle = db) {
  if (ids.length === 0) return 0;
  const rows = await handle
    .update(generationOutput)
    .set({ expiredAt: now })
    .where(and(inArray(generationOutput.id, ids), isNull(generationOutput.savedFileId)))
    .returning({ id: generationOutput.id });
  return rows.length;
}

/**
 * Turns an Output into a file whose object was already copied to `s3Key`, in
 * one transaction: the file row (audited as a File create) and the link. The
 * bytes are not admitted against the quota again; they move from the Output to
 * the file. Throws a `UserFacingError` if the Output was saved or expired since.
 */
export async function saveOutputAsFile(
  outputId: string,
  values: Parameters<typeof createGeneratedFile>[0] & { s3Key: string },
  userId: string,
  handle: AuditHandle = db,
) {
  return handle.transaction(async (tx: Tx) => {
    const [output] = await tx.select().from(generationOutput).where(eq(generationOutput.id, outputId)).for('update');
    if (!output || output.savedFileId) throw new UserFacingError('This Output is already saved to Files.');
    if (output.expiredAt) throw new UserFacingError('This Output has expired.');

    const { s3Key, ...fileValues } = values;
    const created = await createGeneratedFile(fileValues, userId, tx, 'already-counted');
    await tx.update(generationOutput).set({ savedFileId: created.id, s3Key }).where(eq(generationOutput.id, outputId));
    return created;
  });
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

export interface GenerationFilters {
  /** The Category of the Generation's Template, else of its Model. */
  categoryId?: string;
  /** Generations with an Output of one of these kinds. */
  mediaKinds?: MediaKind[];
  /** The id of the last Generation of the previous page. */
  cursor?: string;
  limit: number;
}

/**
 * The User's Generations newest first, each with its Outputs, by keyset
 * pagination on `(created_at, id)`. The cursor row's timestamp is read in SQL:
 * a JS Date would cut its microseconds and skip rows.
 */
export async function listOwnGenerations(userId: string, filters: GenerationFilters, handle: AuditHandle = db) {
  const { categoryId, mediaKinds, cursor, limit } = filters;
  const rows = await handle
    .select()
    .from(generation)
    .where(
      and(
        eq(generation.userId, userId),
        isNull(generation.deletedAt),
        categoryId
          ? or(
              inArray(
                generation.templateId,
                handle.select({ id: studioTemplate.id }).from(studioTemplate).where(eq(studioTemplate.categoryId, categoryId)),
              ),
              and(
                isNull(generation.templateId),
                inArray(
                  generation.modelId,
                  handle.select({ id: studioModel.id }).from(studioModel).where(eq(studioModel.categoryId, categoryId)),
                ),
              ),
            )
          : undefined,
        mediaKinds?.length
          ? inArray(
              generation.id,
              handle
                .select({ id: generationOutput.generationId })
                .from(generationOutput)
                .where(inArray(generationOutput.mediaKind, mediaKinds)),
            )
          : undefined,
        cursor
          ? sql`(${generation.createdAt}, ${generation.id}) < ((SELECT ${generation.createdAt} FROM ${generation} WHERE ${generation.id} = ${cursor}), ${cursor})`
          : undefined,
      ),
    )
    .orderBy(desc(generation.createdAt), desc(generation.id))
    .limit(limit);

  const outputs =
    rows.length === 0
      ? []
      : await handle
          .select()
          .from(generationOutput)
          .where(
            inArray(
              generationOutput.generationId,
              rows.map((row) => row.id),
            ),
          )
          .orderBy(asc(generationOutput.index));
  return rows.map((row) => ({ row, outputs: outputs.filter((output) => output.generationId === row.id) }));
}

/** How many of the User's Generations finished (succeeded or failed) unseen: the nav badge. */
export async function countUnseenGenerations(userId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ count: count() })
    .from(generation)
    .where(
      and(
        eq(generation.userId, userId),
        isNull(generation.seenAt),
        isNull(generation.deletedAt),
        inArray(generation.status, ['succeeded', 'failed']),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Deletes one of the User's finished Generations from their history: its
 * Output rows and its inputs go, the row stays deleted so its cost still
 * counts. Returns the S3 keys of Outputs whose objects are still the Output's
 * own (neither expired nor saved to Files), or undefined when there was no
 * such Generation.
 */
export async function deleteOwnedGeneration(id: string, userId: string, handle: AuditHandle = db) {
  return handle.transaction(async (tx: Tx) => {
    const [row] = await tx
      .select()
      .from(generation)
      .where(and(eq(generation.id, id), eq(generation.userId, userId), isNull(generation.deletedAt)))
      .for('update');
    if (!row) return undefined;
    if (row.status === 'queued' || row.status === 'running') throw new UserFacingError('Cancel this Generation before deleting it.');
    const outputs = await tx.select().from(generationOutput).where(eq(generationOutput.generationId, id));
    await tx.delete(generationOutput).where(eq(generationOutput.generationId, id));
    await tx
      .update(generation)
      .set({ deletedAt: new Date(), formValues: {}, requestInput: null, error: null, progress: null, seenAt: row.seenAt ?? new Date() })
      .where(eq(generation.id, id));
    return outputs.filter((output) => !output.expiredAt && !output.savedFileId).map((output) => output.s3Key);
  });
}

/** Which of these Outputs of the User's still have their media. */
export async function listAvailableOutputIds(userId: string, outputIds: string[], handle: AuditHandle = db) {
  if (outputIds.length === 0) return new Set<string>();
  const rows = await handle
    .select({ id: generationOutput.id })
    .from(generationOutput)
    .innerJoin(generation, eq(generation.id, generationOutput.generationId))
    .where(and(eq(generation.userId, userId), inArray(generationOutput.id, outputIds), isNull(generationOutput.expiredAt)));
  return new Set(rows.map((row) => row.id));
}
