import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, like, lt, lte, or, sql } from 'drizzle-orm';
import { evaluateQuota, StorageQuotaExceededError } from '@/libs/storage-quota';
import { budgetRefusal } from '@/libs/studio/budget';
import {
  ACTIVE_GENERATION_STATUSES,
  FINISHED_GENERATION_STATUSES,
  type GenerationError,
  type GenerationProgress,
  type MediaKind,
} from '@/libs/studio/types';
import { UserFacingError } from '@/libs/user-facing-error';
import type { AuditHandle } from '../audit';
import { db, type Tx } from '../client';
import { file } from '../schema/files';
import { generation, generationOutput, studioModel, studioTemplate } from '../schema/studio';
import { createGeneratedFile, storageUsage } from './files';
import { lockUserStorageQuota } from './storage';
import { getBudgetState, getStudioSettings } from './studio';

/**
 * Query module for Generations and their Outputs. Not audited: their prompts
 * and media are private to the User (see UNAUDITED_MODELS).
 *
 * Every Output object in the bucket is recorded by its row until it is
 * deleted: a row is marked expired only after its object is gone, so a
 * failed delete leaves the row due and the expiry sweep tries again.
 */

export type Generation = typeof generation.$inferSelect;
export type GenerationOutput = typeof generationOutput.$inferSelect;

/** Where Output objects live until they are saved to Files: `studio/<userId>/<generationId>/<index>.<ext>`. */
export const OUTPUT_KEY_PREFIX = 'studio/';

/** The User's own Generations, without those they deleted. */
const ownedBy = (userId: string) => and(eq(generation.userId, userId), isNull(generation.deletedAt));

/**
 * Whether a Generation has its outcome. Only `completed_at` says so: a
 * cancelled Generation whose request fal may still finish has none yet.
 */
export const isGenerationFinished = (row: Pick<Generation, 'completedAt'>) => row.completedAt !== null;

type NewGeneration = Pick<
  typeof generation.$inferInsert,
  'userId' | 'modelId' | 'templateId' | 'fromTemplate' | 'name' | 'endpointId' | 'formValues' | 'estimatedCostUsd'
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
      .where(and(eq(generation.userId, values.userId), inArray(generation.status, ACTIVE_GENERATION_STATUSES)));
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
    .where(and(eq(generation.id, id), ownedBy(userId)));
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
    .where(and(eq(generation.id, id), inArray(generation.status, ACTIVE_GENERATION_STATUSES)))
    .returning();
  return row;
}

/**
 * Generations the poller must check: submitted and not finished, which takes
 * in cancelled ones whose request fal may still finish. `createdBefore` limits
 * it to older ones, when webhooks deliver the rest.
 */
export async function listGenerationsToPoll(createdBefore: Date | null, handle: AuditHandle = db) {
  return handle
    .select()
    .from(generation)
    .where(
      and(
        isNotNull(generation.falRequestId),
        isNull(generation.completedAt),
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
 * Outputs, also for a cancelled Generation whose result arrived anyway, and
 * for one the User deleted meanwhile: its Outputs are recorded already due,
 * so the expiry sweep deletes their objects. A failure marks it failed,
 * except a cancelled one, which stays cancelled. Returns the finished row, or
 * undefined when it was already finished.
 */
export async function completeGeneration(
  id: string,
  outcome: { status: 'succeeded'; outputs: StoredOutput[] } | { status: 'failed'; error: GenerationError },
  handle: AuditHandle = db,
): Promise<Generation | undefined> {
  return handle.transaction(async (tx: Tx) => {
    const [current] = await tx.select().from(generation).where(eq(generation.id, id)).for('update');
    if (!current || isGenerationFinished(current)) return undefined;

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
      await tx.insert(generationOutput).values(
        outcome.outputs.map((output) => ({
          id: crypto.randomUUID(),
          generationId: id,
          ...output,
          expiresAt: current.deletedAt ? completedAt : output.expiresAt,
        })),
      );
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
    .where(and(eq(generation.id, id), inArray(generation.status, ACTIVE_GENERATION_STATUSES)))
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
        ownedBy(userId),
        isNull(generation.seenAt),
        inArray(generation.status, FINISHED_GENERATION_STATUSES),
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
      error: generation.error,
      estimatedCostUsd: generation.estimatedCostUsd,
      completedAt: generation.completedAt,
    })
    .from(generation)
    .where(and(isNull(generation.costSettledAt), isNotNull(generation.completedAt), afterId ? gt(generation.id, afterId) : undefined))
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
    .where(and(eq(generationOutput.id, outputId), ownedBy(userId)));
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
 * Turns an Output into a file whose object was already copied, in one
 * transaction: the file row (audited as a File create) and the link. The
 * bytes are not admitted against the quota again; they move from the Output
 * to the file. The Output keeps its own key until its object is deleted (see
 * `setOutputKey`). Throws a `UserFacingError` if the Output was saved or
 * expired since.
 */
export async function saveOutputAsFile(
  outputId: string,
  values: Parameters<typeof createGeneratedFile>[0],
  userId: string,
  handle: AuditHandle = db,
) {
  return handle.transaction(async (tx: Tx) => {
    const [output] = await tx.select().from(generationOutput).where(eq(generationOutput.id, outputId)).for('update');
    if (!output || output.savedFileId) throw new UserFacingError('This Output is already saved to Files.');
    if (output.expiredAt) throw new UserFacingError('This Output has expired.');

    const created = await createGeneratedFile(values, userId, tx, 'already-counted');
    await tx.update(generationOutput).set({ savedFileId: created.id }).where(eq(generationOutput.id, outputId));
    return created;
  });
}

/** Points a saved Output at its file's object, once its own object is deleted. */
export async function setOutputKey(outputId: string, s3Key: string, handle: AuditHandle = db) {
  await handle.update(generationOutput).set({ s3Key }).where(eq(generationOutput.id, outputId));
}

/**
 * Saved Outputs still on their own object: the move to Files did not get to
 * delete it. Returns where their file's object is (`ownerId` and `url`).
 */
export async function listUnmovedSavedOutputs(limit: number, handle: AuditHandle = db) {
  return handle
    .select({ id: generationOutput.id, s3Key: generationOutput.s3Key, fileOwnerId: file.ownerId, fileUrl: file.url })
    .from(generationOutput)
    .innerJoin(file, eq(file.id, generationOutput.savedFileId))
    .where(like(generationOutput.s3Key, `${OUTPUT_KEY_PREFIX}%`))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// The Studio history
// ---------------------------------------------------------------------------

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
        ownedBy(userId),
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
    .where(and(ownedBy(userId), isNull(generation.seenAt), inArray(generation.status, ['succeeded', 'failed'])));
  return row?.count ?? 0;
}

/**
 * Deletes one of the User's Generations from their history: its inputs go,
 * and its unsaved Outputs become due now, so their objects are deleted right
 * after or by the expiry sweep. The rows stay, so its cost still counts.
 * Returns those Outputs, or undefined when there was no such Generation.
 */
export async function deleteOwnedGeneration(id: string, userId: string, handle: AuditHandle = db) {
  return handle.transaction(async (tx: Tx) => {
    const [row] = await tx
      .select()
      .from(generation)
      .where(and(eq(generation.id, id), ownedBy(userId)))
      .for('update');
    if (!row) return undefined;
    if (ACTIVE_GENERATION_STATUSES.includes(row.status)) throw new UserFacingError('Cancel this Generation before deleting it.');
    const now = new Date();
    await tx
      .update(generation)
      .set({ deletedAt: now, formValues: {}, requestInput: null, error: null, progress: null, seenAt: row.seenAt ?? now })
      .where(eq(generation.id, id));
    return tx
      .update(generationOutput)
      .set({ expiresAt: now })
      .where(and(eq(generationOutput.generationId, id), isNull(generationOutput.expiredAt), isNull(generationOutput.savedFileId)))
      .returning({ id: generationOutput.id, s3Key: generationOutput.s3Key });
  });
}

/** Which of these Outputs of the User's still have their media. */
export async function listAvailableOutputIds(userId: string, outputIds: string[], handle: AuditHandle = db) {
  if (outputIds.length === 0) return new Set<string>();
  const rows = await handle
    .select({ id: generationOutput.id })
    .from(generationOutput)
    .innerJoin(generation, eq(generation.id, generationOutput.generationId))
    .where(and(ownedBy(userId), inArray(generationOutput.id, outputIds), isNull(generationOutput.expiredAt)));
  return new Set(rows.map((row) => row.id));
}
