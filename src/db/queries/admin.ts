import type { Column, SQL } from 'drizzle-orm';
import { and, asc, count, desc, eq, getTableColumns, gt, gte, ilike, inArray, lt, lte, or, sql, sum } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog, writeAuditLogs } from '../audit';
import { db } from '../client';
import { auditLog, cachedImage, rbacGroup, userGroupAssignment } from '../schema/admin';
import { templateGeneration } from '../schema/ai';
import { session, user } from '../schema/auth';
import { file } from '../schema/files';
import { ensureGroupAssignment } from './rbac';

/**
 * Query module for the remaining administrative surfaces (issue #43): the audit
 * browser, cache purging, the deleted-file recycle bin, and user administration.
 *
 * The template, global-variable and model *editing* surfaces are not here —
 * `queries/ai.ts` owns those and this module deliberately does not re-implement
 * them.
 *
 * Every function takes the handle last and defaults it to the module's own `db`,
 * so a caller composes a write into its transaction by passing `tx` and
 * otherwise passes nothing (issue #15).
 */

/**
 * Escapes LIKE metacharacters so `ilike` compares text rather than matching a
 * pattern the user accidentally supplied.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Case-insensitive equality — what `=` meant under `utf8mb4_unicode_ci`. */
function equalsInsensitive(column: Column, value: string): SQL {
  return ilike(column, escapeLike(value));
}

/** Case-insensitive substring match — what Prisma's `contains:` meant. */
function containsInsensitive(column: Column, value: string): SQL {
  return ilike(column, `%${escapeLike(value)}%`);
}

/**
 * Case-insensitive ordering key.
 *
 * MariaDB's `utf8mb4_unicode_ci` sorted case-insensitively. The development and
 * production Postgres run a musl build whose `en_US.utf8` collation orders
 * byte-wise, so `ORDER BY name` puts every capitalised name ahead of every
 * lower-case one — verified against the four migrated users, where it reorders
 * the admin list. `lower()` restores the old order (issue #23).
 *
 * Only applied to columns that actually hold mixed case: `user.email` and
 * `token.key` are lower-cased by the data migration, and `rbac_group.key`,
 * `user.role` and `audit_log.model` hold fixed lower-case or PascalCase
 * vocabularies, so none of them has a case boundary to sort across.
 */
function insensitiveOrderKey(column: Column): SQL {
  return sql`lower(${column})`;
}

// ---------------------------------------------------------------------------
// Audit browsing
// ---------------------------------------------------------------------------

/**
 * Production's audit history is deliberately NOT migrated (issue #24), so
 * `audit_log` starts empty. Every read below returns an empty list or
 * `undefined` in that state rather than throwing.
 */

export type AuditCursor = { timestamp: Date; id: string };

export type AuditLogFilters = {
  model?: string;
  recordId?: string;
  action?: string;
  search?: string;
  cursor?: AuditCursor | null;
  direction?: 'next' | 'previous';
  limit: number;
};

/** Full audit row plus the acting user, or `null` for a system-authored row. */
const auditLogSelection = {
  ...getTableColumns(auditLog),
  user: { id: user.id, name: user.name, email: user.email },
};

/** The distinct models the audit trail holds — the model filter's options. */
export function listAuditModels(handle: AuditHandle = db) {
  return handle.selectDistinct({ model: auditLog.model }).from(auditLog).orderBy(asc(auditLog.model));
}

/**
 * One page of audit rows, newest first (oldest first when paging backwards).
 *
 * The keyset cursor compares `(timestamp, id)` as an explicit OR-pair rather
 * than a row-value expression, matching the Prisma filter it replaces exactly.
 *
 * `model` and `action` are closed vocabularies typed into a URL by an admin, and
 * matched case-insensitively under the old collation — they use escaped `ilike`
 * so a hand-edited `?model=file` keeps finding `File` rows (issue #23).
 * `recordId` stays an exact match: it is only ever an application-generated id
 * followed from a link, so there is no case boundary to cross.
 */
export async function listAuditLogs(filters: AuditLogFilters, handle: AuditHandle = db) {
  const { model, recordId, action, search, cursor, direction = 'next', limit } = filters;

  const conditions: (SQL | undefined)[] = [];
  if (model) conditions.push(equalsInsensitive(auditLog.model, model));
  if (recordId) conditions.push(eq(auditLog.recordId, recordId));
  if (action) conditions.push(equalsInsensitive(auditLog.action, action));

  if (search) {
    conditions.push(
      or(
        containsInsensitive(auditLog.model, search),
        containsInsensitive(auditLog.recordId, search),
        containsInsensitive(auditLog.action, search),
        containsInsensitive(user.name, search),
        containsInsensitive(user.email, search),
      ),
    );
  }

  if (cursor) {
    conditions.push(
      direction === 'previous'
        ? or(gt(auditLog.timestamp, cursor.timestamp), and(eq(auditLog.timestamp, cursor.timestamp), gt(auditLog.id, cursor.id)))
        : or(lt(auditLog.timestamp, cursor.timestamp), and(eq(auditLog.timestamp, cursor.timestamp), lt(auditLog.id, cursor.id))),
    );
  }

  const sort = direction === 'previous' ? asc : desc;
  return handle
    .select(auditLogSelection)
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.userId))
    .where(and(...conditions))
    .orderBy(sort(auditLog.timestamp), sort(auditLog.id))
    .limit(limit);
}

/** One audit row with its acting user, or `undefined`. */
export async function getAuditLogById(id: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select(auditLogSelection)
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.userId))
    .where(eq(auditLog.id, id));
  return row;
}

/**
 * The recent history of one record — the detail view's timeline. `model` and
 * `recordId` come from a row already read, so they are compared exactly.
 */
export function listRelatedAuditLogs(
  { model, recordId, limit }: { model: string; recordId: string; limit: number },
  handle: AuditHandle = db,
) {
  return handle
    .select(auditLogSelection)
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.userId))
    .where(and(eq(auditLog.model, model), eq(auditLog.recordId, recordId)))
    .orderBy(desc(auditLog.timestamp), desc(auditLog.id))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Cache administration
// ---------------------------------------------------------------------------

/**
 * One page of a user's cached proxy images.
 *
 * `purpose` is a fixed literal chosen by the producing code (`image-edit`,
 * `template-edit`), so it is compared exactly — the same reasoning that keeps
 * `cached_image.hash` un-normalised in `queries/ai.ts`.
 */
export async function listOwnerCachedImages(
  { ownerId, purpose, limit, offset }: { ownerId: string; purpose: string; limit: number; offset: number },
  handle: AuditHandle = db,
) {
  const where = and(eq(cachedImage.ownerId, ownerId), eq(cachedImage.purpose, purpose));

  const [images, [totals]] = await Promise.all([
    handle
      .select({
        id: cachedImage.id,
        url: cachedImage.url,
        filename: cachedImage.filename,
        contentType: cachedImage.contentType,
        size: cachedImage.size,
        hash: cachedImage.hash,
        createdAt: cachedImage.createdAt,
      })
      .from(cachedImage)
      .where(where)
      .orderBy(desc(cachedImage.createdAt))
      .limit(limit)
      .offset(offset),
    handle.select({ total: count() }).from(cachedImage).where(where),
  ]);

  return { images, totalCount: totals?.total ?? 0 };
}

/**
 * Drops every cached proxy image. `CachedImage` is a derived artifact and sits
 * in `UNAUDITED_MODELS`, so this deliberately writes no audit rows (issue #13).
 */
export async function purgeCachedImages(handle: AuditHandle = db): Promise<number> {
  const deleted = await handle.delete(cachedImage).returning({ id: cachedImage.id });
  return deleted.length;
}

/**
 * Drops every template generation record. `TemplateGeneration` IS audited, so
 * each removed row records a delete — the Prisma extension audited the
 * equivalent `deleteMany` and dropping that would be a silent regression.
 */
export async function purgeTemplateGenerations(userId: string | null, handle: AuditHandle = db): Promise<number> {
  const before = await handle.select().from(templateGeneration);
  if (before.length === 0) return 0;

  await handle.delete(templateGeneration);
  await writeAuditLogs(
    handle,
    'TemplateGeneration',
    'delete',
    before.map((row) => ({ before: row })),
    userId,
  );
  return before.length;
}

// ---------------------------------------------------------------------------
// Deleted files (the admin recycle bin)
// ---------------------------------------------------------------------------

/**
 * Every soft-deleted file with its owner, newest deletion first.
 *
 * A core select rather than the relational API: the secondary sort is on a
 * related column (`owner.name`), which the relational API cannot express
 * (issue #21).
 */
export function listDeletedFilesWithOwner(handle: AuditHandle = db) {
  return handle
    .select({
      ...getTableColumns(file),
      owner: { id: user.id, name: user.name, email: user.email },
    })
    .from(file)
    .innerJoin(user, eq(user.id, file.ownerId))
    .where(eq(file.isDeleted, true))
    .orderBy(desc(file.deletedAt), asc(insensitiveOrderKey(user.name)));
}

/** The soft-deleted rows among `ids` — the pre-read for restore and purge. */
export async function listSoftDeletedFiles(ids: string[], handle: AuditHandle = db) {
  if (ids.length === 0) return [];
  return handle
    .select()
    .from(file)
    .where(and(inArray(file.id, ids), eq(file.isDeleted, true)));
}

/** Brings soft-deleted files back into the gallery. Audited as `File` updates. */
export async function restoreDeletedFiles(ids: string[], userId: string | null, handle: AuditHandle = db) {
  const before = await listSoftDeletedFiles(ids, handle);
  if (before.length === 0) return [];

  const after = await handle
    .update(file)
    .set({ isDeleted: false, deletedAt: null, updatedAt: new Date() })
    .where(
      and(
        inArray(
          file.id,
          before.map((row) => row.id),
        ),
        eq(file.isDeleted, true),
      ),
    )
    .returning();

  const afterById = new Map(after.map((row) => [row.id, row]));
  for (const row of before) {
    const updated = afterById.get(row.id);
    if (updated) await writeAuditLog(handle, { model: 'File', action: 'update', before: row, after: updated, userId });
  }
  return after;
}

/**
 * Removes file rows outright — the storage object is already gone. Audited as
 * `File` deletes; the caller is responsible for only passing ids whose S3
 * object was actually removed.
 */
export async function hardDeleteFiles(ids: string[], userId: string | null, handle: AuditHandle = db): Promise<number> {
  if (ids.length === 0) return 0;

  const before = await handle.select().from(file).where(inArray(file.id, ids));
  if (before.length === 0) return 0;

  await handle.delete(file).where(
    inArray(
      file.id,
      before.map((row) => row.id),
    ),
  );
  await writeAuditLogs(
    handle,
    'File',
    'delete',
    before.map((row) => ({ before: row })),
    userId,
  );
  return before.length;
}

// ---------------------------------------------------------------------------
// User administration
// ---------------------------------------------------------------------------

/** Identity-only summary of one user, or `undefined`. */
export async function getUserSummary(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, id));
  return row;
}

/** The full user row, or `undefined`. */
export async function getUserById(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(user).where(eq(user.id, id));
  return row;
}

/** Every live account, for the assignee pickers. */
export function listActiveUsers(handle: AuditHandle = db) {
  return handle
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.isDeleted, false))
    .orderBy(asc(insensitiveOrderKey(user.name)));
}

export type AdminUserPageFilters = {
  page: number;
  pageSize: number;
  search?: string;
  sort: 'email' | 'name' | 'role' | 'files';
  order: 'asc' | 'desc';
};

/**
 * One page of the user administration list, each row carrying its live file
 * count and total bytes.
 *
 * This replaces a `$queryRawUnsafe` that only existed because Prisma cannot
 * order a model by an aggregate over a relation. The user-supplied search term
 * was already parameter-bound there and stays bound here — `ilike` takes it as
 * a parameter, nothing is concatenated into SQL, and the sort column and
 * direction come from a `z.enum`, not from the request body.
 *
 * A core select with a LEFT JOIN and GROUP BY, because a relation count is not
 * expressible in the relational API (issue #21). Grouping by `user.id` alone is
 * enough: it is the primary key, so Postgres treats the other selected user
 * columns as functionally dependent. This unifies the two code paths the Prisma
 * version needed — the raw aggregate query and the ORM query plus two follow-up
 * `groupBy` calls — into one statement.
 *
 * `role` is nullable and Postgres orders NULLs last ascending where MariaDB put
 * them first; the column holds a fixed non-null vocabulary in practice.
 */
export async function listAdminUsersPage(filters: AdminUserPageFilters, handle: AuditHandle = db) {
  const { page, pageSize, sort, order } = filters;
  const search = filters.search?.trim();

  const where = and(
    eq(user.isDeleted, false),
    search ? or(containsInsensitive(user.email, search), containsInsensitive(user.name, search)) : undefined,
  );

  const fileCount = count(file.id);
  const totalSize = sum(file.size);
  const direction = order === 'asc' ? asc : desc;

  const orderBy =
    sort === 'files'
      ? [direction(fileCount), asc(user.email), asc(user.id)]
      : sort === 'email'
        ? [direction(user.email), asc(user.id)]
        : sort === 'role'
          ? [direction(user.role), asc(user.email), asc(user.id)]
          : [direction(insensitiveOrderKey(user.name)), asc(user.email), asc(user.id)];

  const [rows, [totals]] = await Promise.all([
    handle
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
        storageQuotaMiB: user.storageQuotaMiB,
        fileCount,
        totalSize,
      })
      .from(user)
      .leftJoin(file, and(eq(file.ownerId, user.id), eq(file.isDeleted, false)))
      .where(where)
      .groupBy(user.id)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    handle.select({ total: count() }).from(user).where(where),
  ]);

  return {
    users: rows.map((row) => ({ ...row, fileCount: Number(row.fileCount), totalSize: Number(row.totalSize ?? 0) })),
    total: totals?.total ?? 0,
  };
}

export type AdminUserFilesFilters = {
  ownerId: string;
  page: number;
  pageSize: number;
  sort?: 'size' | 'date' | 'private';
  order?: 'asc' | 'desc';
  contentTypePrefix?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

const USER_FILE_SORT_COLUMNS = {
  size: file.size,
  date: file.createdAt,
  private: file.private,
} as const;

/**
 * One page of a user's live files, for the per-user file table.
 *
 * The content-type filter was Prisma's `startsWith:`, which inherited
 * case-insensitivity from the old collation, so it becomes an escaped `ilike`
 * prefix match (issue #23).
 */
export async function listAdminUserFiles(filters: AdminUserFilesFilters, handle: AuditHandle = db) {
  const { ownerId, page, pageSize, sort, order = 'desc', contentTypePrefix, dateFrom, dateTo } = filters;

  const conditions: (SQL | undefined)[] = [eq(file.ownerId, ownerId), eq(file.isDeleted, false)];
  if (contentTypePrefix) conditions.push(ilike(file.contentType, `${escapeLike(contentTypePrefix)}%`));
  if (dateFrom) conditions.push(gte(file.createdAt, dateFrom));
  if (dateTo) conditions.push(lte(file.createdAt, dateTo));
  const where = and(...conditions);

  const sortColumn = sort ? USER_FILE_SORT_COLUMNS[sort] : file.createdAt;
  const direction = sort && order === 'asc' ? asc : desc;

  const [files, [totals]] = await Promise.all([
    handle
      .select()
      .from(file)
      .where(where)
      .orderBy(direction(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    handle.select({ total: count() }).from(file).where(where),
  ]);

  return { files, totalFiles: totals?.total ?? 0 };
}

/**
 * The storage keys of every live file a user owns — the pre-read for wiping an
 * account's storage, which is not paginated.
 */
export function listActiveUserFileKeys(ownerId: string, handle: AuditHandle = db) {
  return handle
    .select({ id: file.id, url: file.url })
    .from(file)
    .where(and(eq(file.ownerId, ownerId), eq(file.isDeleted, false)));
}

/** One file by id, regardless of owner — the admin single-file delete pre-read. */
export async function getFileById(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(file).where(eq(file.id, id));
  return row;
}

/** Sets an account's storage allowance. Audited as a `User` update. */
export async function updateUserStorageQuota(
  { id, storageQuotaMiB }: { id: string; storageQuotaMiB: number },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const before = await getUserById(id, handle);
  if (!before) return undefined;

  const [after] = await handle.update(user).set({ storageQuotaMiB, updatedAt: new Date() }).where(eq(user.id, id)).returning();

  if (after) await writeAuditLog(handle, { model: 'User', action: 'update', before, after, userId });
  return after;
}

/**
 * Soft-deletes an account: bans it, marks it deleted and drops its sessions so
 * the guard rejects it immediately.
 *
 * Only the `User` update is audited. The Prisma version also wrote a `Session`
 * delete row per session, but `Session` is in `UNAUDITED_MODELS` as auth churn
 * (issue #13) — porting those rows across would be as wrong as dropping a real
 * one.
 */
export async function softDeleteUserAccount({ id, banReason }: { id: string; banReason: string }, adminId: string | null) {
  return db.transaction(async (tx) => {
    const before = await getUserById(id, tx);
    if (!before) throw new Error('User not found');

    await tx.delete(session).where(eq(session.userId, id));

    const deletedAt = new Date();
    const [after] = await tx
      .update(user)
      .set({ isDeleted: true, deletedAt, banned: true, banReason, banExpires: null, updatedAt: deletedAt })
      .where(eq(user.id, id))
      .returning();

    if (after) await writeAuditLog(tx, { model: 'User', action: 'update', before, after, userId: adminId });
    return after;
  });
}

/** Bans an account and drops its sessions. Audited as a `User` update only. */
export async function suspendUserAccount({ id, banReason }: { id: string; banReason: string }, adminId: string | null) {
  return db.transaction(async (tx) => {
    const before = await getUserById(id, tx);
    if (!before) throw new Error('User not found');

    const [after] = await tx
      .update(user)
      .set({ banned: true, banReason, banExpires: null, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();

    await tx.delete(session).where(eq(session.userId, id));

    if (after) await writeAuditLog(tx, { model: 'User', action: 'update', before, after, userId: adminId });
    return after;
  });
}

/** Lifts a ban. Audited as a `User` update. */
export async function reactivateUserAccount(id: string, adminId: string | null, handle: AuditHandle = db) {
  const before = await getUserById(id, handle);
  if (!before) throw new Error('User not found');

  const [after] = await handle
    .update(user)
    .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning();

  if (after) await writeAuditLog(handle, { model: 'User', action: 'update', before, after, userId: adminId });
  return after;
}

/** The named RBAC groups, in the order the group picker renders them. */
export async function listGroupsByKeys(keys: string[], handle: AuditHandle = db) {
  if (keys.length === 0) return [];
  return handle
    .select({ id: rbacGroup.id, key: rbacGroup.key, name: rbacGroup.name, isSystem: rbacGroup.isSystem })
    .from(rbacGroup)
    .where(inArray(rbacGroup.key, keys));
}

/** The groups a user belongs to, restricted to `groupIds`. */
export async function listUserGroupIds({ userId, groupIds }: { userId: string; groupIds: string[] }, handle: AuditHandle = db) {
  if (groupIds.length === 0) return [];
  const rows = await handle
    .select({ groupId: userGroupAssignment.groupId })
    .from(userGroupAssignment)
    .where(and(eq(userGroupAssignment.userId, userId), inArray(userGroupAssignment.groupId, groupIds)));
  return rows.map((row) => row.groupId);
}

/**
 * Makes a user's group membership exactly `groupIds`.
 *
 * Reconciles rather than deleting every assignment and recreating it the way
 * the Prisma version did: `UserGroupAssignment` is audited, so a blanket
 * delete-and-recreate wrote a delete row for memberships that never changed and
 * reset their `createdAt`. Adds reuse `ensureGroupAssignment` from the RBAC
 * module, which already audits the insert.
 */
export async function replaceUserGroupAssignments(
  { userId, groupIds }: { userId: string; groupIds: string[] },
  adminId: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(userGroupAssignment).where(eq(userGroupAssignment.userId, userId));

    const wanted = new Set(groupIds);
    const removed = existing.filter((row) => !wanted.has(row.groupId));
    if (removed.length > 0) {
      await tx.delete(userGroupAssignment).where(
        inArray(
          userGroupAssignment.id,
          removed.map((row) => row.id),
        ),
      );
      await writeAuditLogs(
        tx,
        'UserGroupAssignment',
        'delete',
        removed.map((row) => ({ before: row })),
        adminId,
      );
    }

    const held = new Set(existing.map((row) => row.groupId));
    for (const groupId of groupIds) {
      if (!held.has(groupId)) await ensureGroupAssignment({ userId, groupId }, adminId, tx);
    }
  });
}

// ---------------------------------------------------------------------------
// Miscellaneous
// ---------------------------------------------------------------------------

/**
 * The raw `tags` strings of an owner's live files, for the gallery's tag filter
 * options. Lives here rather than in `queries/files.ts` because that module
 * belongs to another batch (issue #43's brief); it is the only caller.
 */
export function listOwnerFileTags(ownerId: string, handle: AuditHandle = db) {
  return handle
    .select({ tags: file.tags })
    .from(file)
    .where(and(eq(file.ownerId, ownerId), eq(file.isDeleted, false), sql`${file.tags} IS NOT NULL`));
}
