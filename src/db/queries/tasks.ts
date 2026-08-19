import type { SQL } from 'drizzle-orm';
import { and, avg, count, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, ne, notInArray, or, sql } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { cachedImage } from '../schema/admin';
import { template, templateGeneration } from '../schema/ai';
import { egressEvent, viewEvent } from '../schema/analytics';
import { session, user } from '../schema/auth';
import { task, taskExecution } from '../schema/automation';
import { file, fileMetadata, fileRendition } from '../schema/files';
import type { JsonValue } from '../schema/json';
import { containsInsensitive, equalsInsensitive } from './like';
import { ensureStorageQuotaAvailable } from './storage';

/**
 * Query module for the scheduled-task system (issues #15, #39): the loader, the
 * execution service, the sync service, the individual task functions and the
 * admin views over them.
 *
 * Same contract as the reference slice — call sites import named functions, the
 * `db` handle never leaves `src/db/`, and the audit call lives inside the write.
 *
 * Auditing here is deliberately split (#13):
 *   - `Task` is audited, but only for *definition* changes — create, edit,
 *     enable/disable, delete. Those are acts of a person deciding.
 *   - Scheduler bookkeeping on the same table (`nextExecutionAt`,
 *     `lastExecutionAt`, `retryCount`) is NOT audited. It is written by the
 *     scheduler on every boot and every run, and it is a record of a machine
 *     running — exactly the reason `TaskExecution` is in `UNAUDITED_MODELS`.
 *     The Prisma extension audited it because it could not tell the two apart.
 *   - `TaskExecution`, `Session`, `CachedImage`, `FileRendition`, `ViewEvent`,
 *     `EgressEvent` and `FileMetadata` are all unaudited, per `UNAUDITED_MODELS`.
 *   - `File` and `TemplateGeneration` are audited, and the two writes this
 *     module makes against them carry the audit call.
 *
 * Several task functions reach into other domains (cached images, renditions,
 * analytics, template generations, file metadata). Those queries live here
 * rather than in the owning domain's module because the scheduled task that
 * needs them lives here, and each is a maintenance read or bulk prune with no
 * other caller — moving them would split one task's implementation across five
 * modules to satisfy a filing rule. If a second caller ever appears, that is the
 * signal to move the query to the owning module, not before.
 */

/**
 * Escapes LIKE metacharacters so `ilike` behaves as case-insensitive *equality*
 * rather than a pattern match.
 *
 * MariaDB's `utf8mb4_unicode_ci` compared task names and statuses
 * case-insensitively and the application inherited that without asking for it.
 * Postgres `text` does not, so the insensitivity has to be requested explicitly
 * (issue #23). Task names are human-facing labels shown verbatim in the admin
 * UI, so the remedy is a case-insensitive *comparison*, not lower-casing on
 * write the way file hashes are handled.
 */
// ---------------------------------------------------------------------------
// Task definitions
// ---------------------------------------------------------------------------

export type TaskRow = typeof task.$inferSelect;
export type TaskExecutionRow = typeof taskExecution.$inferSelect;
export type TaskWithExecutions = TaskRow & { executions: TaskExecutionRow[] };

/** Enabled tasks, each with its most recent execution. */
export function listEnabledTasks(): Promise<TaskWithExecutions[]> {
  return db.query.task.findMany({
    where: { enabled: true },
    with: { executions: { orderBy: { startedAt: 'desc' }, limit: 1 } },
  });
}

/** Every task, newest first, each with its five most recent executions. */
export function listAllTasks(): Promise<TaskWithExecutions[]> {
  return db.query.task.findMany({
    with: { executions: { orderBy: { startedAt: 'desc' }, limit: 5 } },
    orderBy: { createdAt: 'desc' },
  });
}

/** One task with its ten most recent executions. */
export async function getTaskById(taskId: string): Promise<TaskWithExecutions | null> {
  const row = await db.query.task.findFirst({
    where: { id: taskId },
    with: { executions: { orderBy: { startedAt: 'desc' }, limit: 10 } },
  });
  return row ?? null;
}

/**
 * One task by name, compared case-insensitively — the unique index is
 * case-sensitive on Postgres where it was not on MariaDB, so the comparison has
 * to say so.
 */
export async function getTaskByName(name: string): Promise<TaskWithExecutions | null> {
  const [row] = await db.select({ id: task.id }).from(task).where(equalsInsensitive(task.name, name)).limit(1);
  return row ? getTaskById(row.id) : null;
}

/** A task with its five most recent executions — the shape the admin API returns. */
async function getTaskWithRecentExecutions(taskId: string, handle: AuditHandle): Promise<TaskWithExecutions> {
  const [row] = await handle.select().from(task).where(eq(task.id, taskId));
  if (!row) throw new Error(`Task ${taskId} not found`);
  const executions = await handle
    .select()
    .from(taskExecution)
    .where(eq(taskExecution.taskId, taskId))
    .orderBy(desc(taskExecution.startedAt))
    .limit(5);
  return { ...row, executions };
}

type TaskDefinitionValues = {
  name: string;
  description: string;
  cronExpression: string;
  taskFunction: string;
  args?: JsonValue | null;
  enabled?: boolean;
  timeout?: number | null;
  maxRetries?: number;
  nextExecutionAt?: Date | null;
  createdBy?: string | null;
};

/** Creates a task definition. Audited — a person decided this job should exist. */
export async function createTask(
  values: TaskDefinitionValues,
  userId?: string | null,
  handle: AuditHandle = db,
): Promise<TaskWithExecutions> {
  const [row] = await handle
    .insert(task)
    .values({ id: crypto.randomUUID(), ...values })
    .returning();
  if (!row) throw new Error('Failed to create task');

  await writeAuditLog(handle, { model: 'Task', action: 'create', after: row, userId });
  return { ...row, executions: [] };
}

/**
 * Updates a task definition. Audited.
 *
 * `updatedAt` is set here because Prisma applied `@updatedAt` at query level
 * rather than in the database (issue #23).
 */
export async function updateTaskDefinition(
  taskId: string,
  values: Partial<TaskDefinitionValues>,
  userId?: string | null,
  handle: AuditHandle = db,
): Promise<TaskWithExecutions | null> {
  const [before] = await handle.select().from(task).where(eq(task.id, taskId));
  if (!before) return null;

  const [after] = await handle
    .update(task)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(task.id, taskId))
    .returning();
  if (!after) return null;

  await writeAuditLog(handle, { model: 'Task', action: 'update', before, after, userId });
  return getTaskWithRecentExecutions(taskId, handle);
}

/** Deletes a task; its executions go with it via ON DELETE CASCADE. Audited. */
export async function deleteTask(taskId: string, userId?: string | null, handle: AuditHandle = db): Promise<TaskRow | null> {
  const [before] = await handle.select().from(task).where(eq(task.id, taskId));
  if (!before) return null;

  await handle.delete(task).where(eq(task.id, taskId));
  await writeAuditLog(handle, { model: 'Task', action: 'delete', before, userId });
  return before;
}

/**
 * Scheduler bookkeeping. Deliberately unaudited: this runs on every boot for
 * every enabled task and records where the clock is, not what anyone decided.
 */
export async function setTaskNextExecutionAt(taskId: string, nextExecutionAt: Date | null, handle: AuditHandle = db): Promise<void> {
  await handle.update(task).set({ nextExecutionAt, updatedAt: new Date() }).where(eq(task.id, taskId));
}

/** Scheduler bookkeeping, unaudited — see `setTaskNextExecutionAt`. */
export async function setTaskLastExecutionAt(taskId: string, lastExecutionAt: Date, handle: AuditHandle = db): Promise<void> {
  await handle.update(task).set({ lastExecutionAt, updatedAt: new Date() }).where(eq(task.id, taskId));
}

/**
 * Bumps `retryCount` in the database rather than reading and writing it, so a
 * concurrent run cannot lose an increment. Retry bookkeeping, unaudited — see
 * `setTaskNextExecutionAt`.
 *
 * The unqualified `retry_count` this renders is safe: it is a SET clause on a
 * single-table UPDATE, where there is no other relation for it to bind to.
 */
export async function incrementTaskRetryCount(taskId: string, handle: AuditHandle = db): Promise<void> {
  await handle
    .update(task)
    .set({ retryCount: sql`${task.retryCount} + 1`, updatedAt: new Date() })
    .where(eq(task.id, taskId));
}

/** Retry bookkeeping, unaudited — see `setTaskNextExecutionAt`. */
export async function resetTaskRetryCount(taskId: string, handle: AuditHandle = db): Promise<void> {
  await handle.update(task).set({ retryCount: 0, updatedAt: new Date() }).where(eq(task.id, taskId));
}

// ---------------------------------------------------------------------------
// Task executions — never audited (`UNAUDITED_MODELS`: execution record, not intent)
// ---------------------------------------------------------------------------

export async function createTaskExecution(
  { taskId, triggeredBy, executedBy }: { taskId: string; triggeredBy: string; executedBy?: string | null },
  handle: AuditHandle = db,
): Promise<TaskExecutionRow> {
  const [row] = await handle
    .insert(taskExecution)
    .values({
      id: crypto.randomUUID(),
      taskId,
      status: 'pending',
      triggeredBy,
      executedBy: executedBy || null,
      logs: [],
      startedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error('Failed to create task execution');
  return row;
}

export async function updateTaskExecution(
  executionId: string,
  values: {
    status: string;
    result?: JsonValue;
    error?: string | null;
    logs?: JsonValue;
    duration?: number | null;
    completedAt?: Date | null;
  },
  handle: AuditHandle = db,
): Promise<void> {
  await handle
    .update(taskExecution)
    .set({
      status: values.status,
      result: values.result ?? null,
      error: values.error ?? null,
      logs: values.logs ?? [],
      duration: values.duration ?? null,
      completedAt: values.completedAt ?? null,
    })
    .where(eq(taskExecution.id, executionId));
}

const executionTaskColumns = {
  id: task.id,
  name: task.name,
  description: task.description,
  taskFunction: task.taskFunction,
};

const executionUserColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
};

const executionColumns = {
  id: taskExecution.id,
  taskId: taskExecution.taskId,
  status: taskExecution.status,
  startedAt: taskExecution.startedAt,
  completedAt: taskExecution.completedAt,
  duration: taskExecution.duration,
  result: taskExecution.result,
  error: taskExecution.error,
  logs: taskExecution.logs,
  triggeredBy: taskExecution.triggeredBy,
  executedBy: taskExecution.executedBy,
};

export type ExecutionWithRelations = TaskExecutionRow & {
  task: { id: string; name: string; description: string; taskFunction: string };
  executedByUser: { id: string; name: string; email: string } | null;
};

export type ExecutionFilters = {
  taskId?: string;
  status?: string;
  since?: Date;
  /** Matches the task name or the error text, case-insensitively. */
  search?: string;
};

/**
 * The filter set shared by the execution list and its statistics, so the two
 * cannot drift. `status` comes straight off an admin query string, so it is
 * compared case-insensitively (issue #23).
 */
function executionConditions({ taskId, status, since, search }: ExecutionFilters): SQL[] {
  const conditions: SQL[] = [];
  if (taskId) conditions.push(eq(taskExecution.taskId, taskId));
  if (status) conditions.push(equalsInsensitive(taskExecution.status, status));
  if (since) conditions.push(gte(taskExecution.startedAt, since));
  if (search) {
    const matcher = or(containsInsensitive(task.name, search), containsInsensitive(taskExecution.error, search));
    if (matcher) conditions.push(matcher);
  }
  return conditions;
}

export type ExecutionCursor = { startedAt: Date; id: string };

/**
 * A keyset page of executions with their task and, when there is one, the admin
 * who triggered them.
 *
 * The cursor is expressed with `or`/`and` on typed columns rather than a
 * row-value `sql` template: the query joins `task` and `user`, both of which
 * have an `id`, and Drizzle renders interpolated columns unqualified inside a
 * template (issue #21). `lt(taskExecution.id, ...)` cannot be ambiguous.
 *
 * `limit + 1` rows come back so the caller can tell whether another page exists.
 */
export async function listTaskExecutions(
  filters: ExecutionFilters,
  { cursor, direction, limit }: { cursor: ExecutionCursor | null; direction: 'next' | 'previous'; limit: number },
): Promise<ExecutionWithRelations[]> {
  const conditions = executionConditions(filters);
  const backwards = direction === 'previous';

  if (cursor) {
    const beyond = backwards
      ? or(
          gt(taskExecution.startedAt, cursor.startedAt),
          and(eq(taskExecution.startedAt, cursor.startedAt), gt(taskExecution.id, cursor.id)),
        )
      : or(
          lt(taskExecution.startedAt, cursor.startedAt),
          and(eq(taskExecution.startedAt, cursor.startedAt), lt(taskExecution.id, cursor.id)),
        );
    if (beyond) conditions.push(beyond);
  }

  const order = backwards ? [taskExecution.startedAt, taskExecution.id] : [desc(taskExecution.startedAt), desc(taskExecution.id)];

  const rows = await db
    .select({ ...executionColumns, task: executionTaskColumns, executedByUser: executionUserColumns })
    .from(taskExecution)
    .innerJoin(task, eq(task.id, taskExecution.taskId))
    .leftJoin(user, eq(user.id, taskExecution.executedBy))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(limit + 1);

  return rows as ExecutionWithRelations[];
}

/** One execution with its task and triggering admin, or null. */
export async function getTaskExecution(executionId: string): Promise<ExecutionWithRelations | null> {
  const [row] = await db
    .select({ ...executionColumns, task: executionTaskColumns, executedByUser: executionUserColumns })
    .from(taskExecution)
    .innerJoin(task, eq(task.id, taskExecution.taskId))
    .leftJoin(user, eq(user.id, taskExecution.executedBy))
    .where(eq(taskExecution.id, executionId));
  return (row as ExecutionWithRelations | undefined) ?? null;
}

/**
 * Executions grouped by status, plus the mean duration of the successful ones.
 *
 * Grouping and aggregation are the shapes the relational API cannot express, so
 * this is a core select with an explicit GROUP BY (issue #21). `task_execution`
 * is excluded from the data migration (#24) and so starts empty: every caller
 * gets `{}` and `0` rather than a crash, which is what the admin views render.
 */
export async function taskExecutionStats(
  filters: ExecutionFilters,
): Promise<{ byStatus: Record<string, number>; averageDuration: number; total: number }> {
  const conditions = executionConditions(filters);
  // The mean is over successful runs specifically, so any status filter in
  // `filters` is replaced rather than intersected — the Prisma version did the
  // same by spreading `status: 'success'` over the shared where clause.
  const averageConditions = executionConditions({ ...filters, status: undefined });

  const [byStatusRows, [averageRow]] = await Promise.all([
    db
      .select({ status: taskExecution.status, total: count() })
      .from(taskExecution)
      .innerJoin(task, eq(task.id, taskExecution.taskId))
      .where(and(...conditions))
      .groupBy(taskExecution.status),
    db
      .select({ average: avg(taskExecution.duration) })
      .from(taskExecution)
      .innerJoin(task, eq(task.id, taskExecution.taskId))
      .where(and(...averageConditions, eq(taskExecution.status, 'success'), isNotNull(taskExecution.duration))),
  ]);

  const byStatus = Object.fromEntries(byStatusRows.map((row) => [row.status, Number(row.total)]));
  return {
    byStatus,
    averageDuration: Number(averageRow?.average ?? 0),
    total: byStatusRows.reduce((sum, row) => sum + Number(row.total), 0),
  };
}

/** The tasks with the most executions since `since`, busiest first. */
export async function mostActiveTasks(since: Date, limit: number): Promise<{ taskId: string; taskName: string; executionCount: number }[]> {
  const total = count();
  const rows = await db
    .select({ taskId: taskExecution.taskId, taskName: task.name, executionCount: total })
    .from(taskExecution)
    .innerJoin(task, eq(task.id, taskExecution.taskId))
    .where(gte(taskExecution.startedAt, since))
    .groupBy(taskExecution.taskId, task.name)
    .orderBy(desc(total))
    .limit(limit);
  return rows.map((row) => ({ ...row, executionCount: Number(row.executionCount) }));
}

/**
 * Prunes execution history. Unaudited, like every other write to this table.
 *
 * The count comes from the driver rather than `.returning()`: this is the
 * second-largest table in production and a prune can span millions of rows,
 * which `.returning()` would pull into memory only to take `.length`.
 */
export async function deleteTaskExecutionsBefore(cutoff: Date): Promise<number> {
  const deleted = await db.delete(taskExecution).where(lt(taskExecution.startedAt, cutoff));
  return deleted.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Task-function workloads
// ---------------------------------------------------------------------------

/**
 * Deletes expired sessions in bulk.
 *
 * `Session` is in `UNAUDITED_MODELS` ("session and auth churn"), so this writes
 * no audit rows — the Prisma extension would have tried to write one per row.
 */
export async function deleteExpiredSessions(now: Date): Promise<number> {
  const deleted = await db.delete(session).where(lt(session.expiresAt, now));
  return deleted.rowCount ?? 0;
}

/** Cache rows untouched since `cutoff`, oldest-first is irrelevant — a batch. */
export function listExpiredCachedImages(cutoff: Date, limit: number) {
  return db
    .select({ id: cachedImage.id, url: cachedImage.url, lastAccessedAt: cachedImage.lastAccessedAt, createdAt: cachedImage.createdAt })
    .from(cachedImage)
    .where(lt(cachedImage.lastAccessedAt, cutoff))
    .limit(limit);
}

/**
 * The subset of `urls` still referenced by a cache row outside `excludeIds`.
 * One S3 object can back several owner-scoped rows, so only the unreferenced
 * ones may be deleted from the bucket.
 */
export async function listRetainedCachedImageUrls(urls: string[], excludeIds: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const rows = await db
    .select({ url: cachedImage.url })
    .from(cachedImage)
    .where(and(inArray(cachedImage.url, urls), excludeIds.length > 0 ? notInArray(cachedImage.id, excludeIds) : undefined));
  return new Set(rows.map((row) => row.url));
}

/** `CachedImage` is a derived artifact — unaudited. */
export async function deleteCachedImages(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const deleted = await db.delete(cachedImage).where(inArray(cachedImage.id, ids));
  return deleted.rowCount ?? 0;
}

/** Renditions untouched since `cutoff`, capped at `limit`. */
export function listStaleFileRenditions(cutoff: Date, limit: number) {
  return db
    .select({ id: fileRendition.id, s3Key: fileRendition.s3Key })
    .from(fileRendition)
    .where(lt(fileRendition.lastAccessedAt, cutoff))
    .limit(limit);
}

/** `FileRendition` is a derived artifact — unaudited. */
export async function deleteFileRenditions(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const deleted = await db.delete(fileRendition).where(inArray(fileRendition.id, ids));
  return deleted.rowCount ?? 0;
}

/** Raw analytics rows are unaudited by definition (`UNAUDITED_MODELS`: analytics). */
export async function deleteRawAnalyticsBefore(cutoff: Date): Promise<{ viewEvents: number; egressEvents: number }> {
  const [views, egress] = await Promise.all([
    db.delete(viewEvent).where(lt(viewEvent.createdAt, cutoff)),
    db.delete(egressEvent).where(lt(egressEvent.createdAt, cutoff)),
  ]);
  return { viewEvents: views.rowCount ?? 0, egressEvents: egress.rowCount ?? 0 };
}

/**
 * Generations still marked `processing` that the reconciler should chase: either
 * Replicate never reported a streaming status, or the stream has been open long
 * enough to be considered stale.
 */
export function listStuckTemplateGenerations(staleStreamingCutoff: Date, limit: number) {
  // An inner join rather than the relational `with:`, because `templateId` is
  // NOT NULL and the join makes that visible in the type — the relational
  // relation is declared optional, which would force a null check the foreign
  // key already rules out.
  return db
    .select({
      id: templateGeneration.id,
      templateId: templateGeneration.templateId,
      userId: templateGeneration.userId,
      replicateId: templateGeneration.replicateId,
      template: { name: template.name },
    })
    .from(templateGeneration)
    .innerJoin(template, eq(template.id, templateGeneration.templateId))
    .where(
      and(
        eq(templateGeneration.status, 'processing'),
        isNotNull(templateGeneration.replicateId),
        or(
          isNull(templateGeneration.replicateStatus),
          ne(templateGeneration.replicateStatus, 'streaming'),
          lt(templateGeneration.createdAt, staleStreamingCutoff),
        ),
      ),
    )
    .limit(limit);
}

/** `TemplateGeneration` is audited, so the failure the reconciler records is too. */
export async function markTemplateGenerationFailed(
  generationId: string,
  { errorMessage, replicateStatus }: { errorMessage: string; replicateStatus?: string },
  userId?: string | null,
  handle: AuditHandle = db,
): Promise<void> {
  const [before] = await handle.select().from(templateGeneration).where(eq(templateGeneration.id, generationId));
  if (!before) return;

  const [after] = await handle
    .update(templateGeneration)
    .set({ status: 'failed', errorMessage, ...(replicateStatus ? { replicateStatus } : {}) })
    .where(eq(templateGeneration.id, generationId))
    .returning();
  if (!after) return;

  await writeAuditLog(handle, { model: 'TemplateGeneration', action: 'update', before, after, userId });
}

/**
 * Live images with no recorded pixel dimensions.
 *
 * Prisma's `startsWith:` inherited case-insensitivity from the MariaDB
 * collation, so the content-type test is `ilike` (issue #23) — `IMAGE/PNG` was
 * matched before and still is.
 */
export function listImagesMissingDimensions() {
  return db
    .select({ id: file.id, url: file.url, ownerId: file.ownerId })
    .from(file)
    .leftJoin(fileMetadata, eq(fileMetadata.fileId, file.id))
    .where(and(ilike(file.contentType, 'image/%'), eq(file.isDeleted, false), or(isNull(fileMetadata.id), isNull(fileMetadata.width))))
    .orderBy(file.createdAt);
}

/** `FileMetadata` is a derived artifact — unaudited. */
export async function upsertFileDimensions(fileId: string, width: number, height: number): Promise<void> {
  await db
    .insert(fileMetadata)
    .values({ id: crypto.randomUUID(), fileId, width, height })
    .onConflictDoUpdate({ target: fileMetadata.fileId, set: { width, height, updatedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// S3 <-> database sync
// ---------------------------------------------------------------------------

/**
 * One page of live files ordered by id, for comparing the database against the
 * bucket. Prisma's `cursor` + `skip: 1` becomes an explicit `id > cursor`, which
 * is the same result and stays on the primary key.
 */
export function listFilesForSync({ ownerId, afterId, limit }: { ownerId?: string; afterId?: string; limit: number }) {
  return db
    .select({
      id: file.id,
      url: file.url,
      title: file.title,
      size: file.size,
      contentType: file.contentType,
      createdAt: file.createdAt,
      ownerId: file.ownerId,
    })
    .from(file)
    .where(and(eq(file.isDeleted, false), ownerId ? eq(file.ownerId, ownerId) : undefined, afterId ? gt(file.id, afterId) : undefined))
    .orderBy(file.id)
    .limit(limit);
}

/**
 * Soft-deletes files by id regardless of owner — the admin sync view, which
 * reconciles the whole bucket. `File` is audited, so each row gets an audit
 * entry, exactly as the implicit extension produced for `updateMany`.
 *
 * The owner-scoped equivalent is `softDeleteFiles` in the files module; this is
 * the admin variant and belongs there once that module is free to take it.
 */
export async function softDeleteFilesAnyOwner(ids: string[], userId?: string | null, handle: AuditHandle = db): Promise<number> {
  if (ids.length === 0) return 0;

  const before = await handle
    .select()
    .from(file)
    .where(and(inArray(file.id, ids), eq(file.isDeleted, false)));
  if (before.length === 0) return 0;

  const deletedAt = new Date();
  const after = await handle
    .update(file)
    .set({ isDeleted: true, deletedAt, updatedAt: deletedAt })
    .where(
      and(
        inArray(
          file.id,
          before.map((row) => row.id),
        ),
        eq(file.isDeleted, false),
      ),
    )
    .returning();

  const afterById = new Map(after.map((row) => [row.id, row]));
  for (const row of before) {
    const updated = afterById.get(row.id);
    if (updated) await writeAuditLog(handle, { model: 'File', action: 'update', before: row, after: updated, userId });
  }
  return after.length;
}

/**
 * Adopts an object that exists in S3 but not in the database.
 *
 * The transaction is opened here rather than at the call site because the `db`
 * handle stays inside `src/db/` (#15). Admission control and the insert it
 * guards must share one transaction: the quota read takes a row lock, and a
 * lock released before the insert lets two concurrent adoptions both fit.
 */
export async function createSyncedFile(
  {
    ownerId,
    size,
    url,
    title,
    contentType,
    createdAt,
  }: { ownerId: string; size: number; url: string; title: string; contentType: string; createdAt: Date },
  userId?: string | null,
) {
  return db.transaction(async (tx) => {
    await ensureStorageQuotaAvailable(ownerId, size, tx);
    const [created] = await tx
      .insert(file)
      .values({ id: crypto.randomUUID(), ownerId, size, url, title, contentType, private: false, createdAt })
      .returning();
    if (!created) throw new Error('Failed to create file');
    await writeAuditLog(tx, { model: 'File', action: 'create', after: created, userId });
    return created;
  });
}
