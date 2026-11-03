import { and, asc, count, eq, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import { evaluateQuota, StorageQuotaExceededError } from '@/libs/storage-quota';
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

export interface BudgetState {
  /** Null means unlimited. */
  limitUsd: number | null;
  spentUsd: number;
  remainingUsd: number | null;
}

/** A User's Budget for the current UTC month. Currently always unlimited. */
export async function getBudgetState(_userId: string, _handle: AuditHandle = db): Promise<BudgetState> {
  return { limitUsd: null, spentUsd: 0, remainingUsd: null };
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

    const budget = await getBudgetState(values.userId, tx);
    if (budget.remainingUsd !== null && (values.estimatedCostUsd ?? 0) > budget.remainingUsd) {
      throw new UserFacingError(
        `This would cost about ${values.estimatedCostUsd} $, but only ${budget.remainingUsd} $ of your monthly Budget is left.`,
        'StudioBudgetError',
      );
    }

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

export async function getOwnedGeneration(id: string, userId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select()
    .from(generation)
    .where(and(eq(generation.id, id), eq(generation.userId, userId)));
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
