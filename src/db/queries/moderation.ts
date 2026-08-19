import { and, asc, desc, eq, gt, ilike, isNotNull, not, or } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { denylistEntry, moderationCase } from '../schema/admin';
import { file } from '../schema/files';
import type { JsonValue } from '../schema/json';
import { normaliseFileHashes, normaliseHash } from './files';

/**
 * Query module for content moderation — the denylist hash gate and the admin
 * moderation surface (issue #42). Same contract as the files module: call sites
 * import named functions, the `db` handle stays inside `src/db/`, and the audit
 * call lives inside the write function.
 *
 * This module carries the epic's highest-consequence collation fix. The gate
 * matches content hashes for exact equality. MariaDB's utf8mb4_unicode_ci made
 * that case-insensitive; Postgres `text`/`varchar` does not, so a case-mismatched
 * entry silently stops blocking content. It fails OPEN — no error, nothing in
 * the logs. Reproduced against a live Postgres in issue #23.
 *
 * Two different remedies are applied here, and the difference matters:
 *
 * - `denylist_entry.hash` and `file.sha256/md5/phash` are normalised to their
 *   canonical lower-case hex on WRITE and on READ (`normaliseHash`, shared with
 *   the files module). The read side alone is a proven no-op — with a value
 *   stored upper-case, a case-normalised read still returns zero rows — and the
 *   write side alone leaves every historical row broken. Both sides are needed,
 *   which is why `scripts/db/transform-tables.ts` also lower-cases these columns
 *   for rows that already exist.
 * - Status columns (`file.moderation_status`, `moderation_case.status`) are
 *   normalised in the data too — both are in `LOWERCASED` in
 *   `scripts/db/transform-tables.ts`, which was a no-op across all 4,230
 *   production rows because they already read `clear`. `ilike` is kept on top of
 *   that as the belt to the transform's braces: it restores the MariaDB
 *   behaviour on whatever is actually in the column, so a row written in another
 *   case by some future path still matches. The status literals are a closed
 *   TypeScript union containing no LIKE metacharacters, so this stays an
 *   equality test and needs no escaping.
 */

export type HashType = 'sha256' | 'md5' | 'phash';
export type ModerationStatus = 'clear' | 'quarantined' | 'confirmed' | 'released' | 'escalated';

/** Case-insensitive equality on a status column. See the module comment. */
function statusIs(column: typeof file.moderationStatus | typeof moderationCase.status, status: ModerationStatus) {
  return ilike(column, status);
}

/**
 * The exact half of the gate: does either cryptographic hash appear on the
 * denylist? Both sides of the comparison are lower-cased hex.
 *
 * Perceptual-hash matching is distance-based and lives in
 * `listPhashDenylistEntries`; only this exact path is collation-sensitive.
 */
export async function findExactDenylistMatch(
  { sha256, md5 }: { sha256: string; md5: string },
  handle: AuditHandle = db,
): Promise<{ id: string; hashType: string } | undefined> {
  const [row] = await handle
    .select({ id: denylistEntry.id, hashType: denylistEntry.hashType })
    .from(denylistEntry)
    .where(
      or(
        and(eq(denylistEntry.hashType, 'sha256'), eq(denylistEntry.hash, normaliseHash(sha256))),
        and(eq(denylistEntry.hashType, 'md5'), eq(denylistEntry.hash, normaliseHash(md5))),
      ),
    )
    .limit(1);
  return row;
}

/**
 * One page of perceptual-hash denylist entries, ordered by id so the caller can
 * walk the whole table with a keyset cursor. Replaces Prisma's `cursor` + `skip: 1`.
 */
export function listPhashDenylistEntries({ cursor, limit }: { cursor?: string; limit: number }, handle: AuditHandle = db) {
  return handle
    .select({ id: denylistEntry.id, hash: denylistEntry.hash })
    .from(denylistEntry)
    .where(and(eq(denylistEntry.hashType, 'phash'), cursor ? gt(denylistEntry.id, cursor) : undefined))
    .orderBy(asc(denylistEntry.id))
    .limit(limit);
}

/** The denylist as the admin surface shows it — newest first. */
export function listDenylistEntries(limit = 200, handle: AuditHandle = db) {
  return handle.select().from(denylistEntry).orderBy(desc(denylistEntry.createdAt)).limit(limit);
}

/** Adds one denylist entry. Audited — administrative action (issue #13). */
export async function createDenylistEntry(
  values: { hashType: HashType; hash: string; severity: string; notes?: string; source?: string; addedBy: string | null },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [row] = await handle
    .insert(denylistEntry)
    .values({
      id: crypto.randomUUID(),
      hashType: values.hashType,
      hash: normaliseHash(values.hash),
      severity: values.severity,
      notes: values.notes ?? null,
      ...(values.source ? { source: values.source } : {}),
      addedBy: values.addedBy,
    })
    .returning();
  if (!row) throw new Error('Failed to create denylist entry');
  await writeAuditLog(handle, { model: 'DenylistEntry', action: 'create', after: row, userId });
  return row;
}

/**
 * Bulk denylist import. Prisma's `skipDuplicates` becomes `ON CONFLICT DO NOTHING`
 * on the `(hash_type, hash)` unique index.
 *
 * Entries are de-duplicated in memory first because normalising the hex can
 * itself create duplicates within one batch — `ABC…` and `abc…` are the same
 * entry once canonicalised, and only the database would have found that out.
 */
export async function importDenylistEntries(
  {
    source,
    entries,
    addedBy,
  }: {
    source: string;
    entries: { hashType: HashType; hash: string; severity: string; notes?: string }[];
    addedBy: string | null;
  },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const deduped = new Map<string, typeof denylistEntry.$inferInsert>();
  for (const entry of entries) {
    const hash = normaliseHash(entry.hash);
    deduped.set(`${entry.hashType}:${hash}`, {
      id: crypto.randomUUID(),
      hashType: entry.hashType,
      hash,
      severity: entry.severity,
      notes: entry.notes ?? null,
      source,
      addedBy,
    });
  }
  if (deduped.size === 0) return { imported: 0 };

  const rows = await handle
    .insert(denylistEntry)
    .values([...deduped.values()])
    .onConflictDoNothing({ target: [denylistEntry.hashType, denylistEntry.hash] })
    .returning();

  for (const row of rows) {
    await writeAuditLog(handle, { model: 'DenylistEntry', action: 'create', after: row, userId });
  }
  return { imported: rows.length };
}

/**
 * The moderation queue with each case's file.
 *
 * `moderation_case.file_id` carries no foreign key in the source schema, so
 * there is no relation to declare (issue #14). A LEFT JOIN keeps it to one
 * round trip and still yields `file: null` for a case whose file is gone.
 */
export function listModerationQueue(limit = 100, handle: AuditHandle = db) {
  return handle
    .select({
      id: moderationCase.id,
      fileId: moderationCase.fileId,
      status: moderationCase.status,
      matchType: moderationCase.matchType,
      matchedEntryId: moderationCase.matchedEntryId,
      distance: moderationCase.distance,
      uploaderId: moderationCase.uploaderId,
      reviewerId: moderationCase.reviewerId,
      resolution: moderationCase.resolution,
      uploadMetadata: moderationCase.uploadMetadata,
      createdAt: moderationCase.createdAt,
      resolvedAt: moderationCase.resolvedAt,
      updatedAt: moderationCase.updatedAt,
      file: {
        id: file.id,
        title: file.title,
        ownerId: file.ownerId,
        contentType: file.contentType,
        size: file.size,
        createdAt: file.createdAt,
      },
    })
    .from(moderationCase)
    .leftJoin(file, eq(file.id, moderationCase.fileId))
    .orderBy(desc(moderationCase.createdAt))
    .limit(limit);
}

/** Whether a file already has an open (quarantined) case — the rescan's guard. */
export async function findOpenModerationCase(fileId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ id: moderationCase.id })
    .from(moderationCase)
    .where(and(eq(moderationCase.fileId, fileId), statusIs(moderationCase.status, 'quarantined')))
    .limit(1);
  return row;
}

/**
 * Quarantines a file and opens a moderation case for it, atomically.
 *
 * Both halves are audited: the file change as `File`, the case as
 * `ModerationCase`. `handle.transaction` accepts a transaction handle as well as
 * the top-level one, so a caller already inside a transaction gets a savepoint
 * rather than a second connection.
 *
 * `hashes` is optional because the rescan path re-reads hashes already stored on
 * the row; when supplied they are normalised on the way in, matching the read
 * side of the gate.
 */
export async function quarantineFile(
  {
    fileId,
    hashes,
    matchType,
    matchedEntryId,
    distance,
    uploaderId,
    reviewerId,
    uploadMetadata,
  }: {
    fileId: string;
    hashes?: { sha256: string; md5: string; phash: string | null };
    matchType: HashType;
    matchedEntryId: string | null;
    distance: number | null;
    uploaderId: string | null;
    reviewerId?: string | null;
    uploadMetadata?: JsonValue;
  },
  userId: string | null,
  handle: AuditHandle = db,
) {
  return handle.transaction(async (tx) => {
    const [before] = await tx.select().from(file).where(eq(file.id, fileId));

    const [after] = await tx
      .update(file)
      .set({
        private: true,
        moderationStatus: 'quarantined',
        ...(hashes ? normaliseFileHashes(hashes) : {}),
        updatedAt: new Date(),
      })
      .where(eq(file.id, fileId))
      .returning();
    if (before && after) await writeAuditLog(tx, { model: 'File', action: 'update', before, after, userId });

    const [created] = await tx
      .insert(moderationCase)
      .values({
        id: crypto.randomUUID(),
        fileId,
        status: 'quarantined',
        matchType,
        matchedEntryId,
        distance,
        uploaderId,
        reviewerId: reviewerId ?? null,
        uploadMetadata: uploadMetadata ?? null,
      })
      .returning();
    if (!created) throw new Error('Failed to create moderation case');
    await writeAuditLog(tx, { model: 'ModerationCase', action: 'create', after: created, userId });

    return created;
  });
}

/**
 * Resolves a case and applies the consequence to its file, atomically:
 * `released` clears the file, `confirmed` soft-deletes it, `escalated` leaves it
 * quarantined. Both models are audited.
 */
export async function resolveModerationCase(
  {
    id,
    status,
    resolution,
    reviewerId,
  }: {
    id: string;
    status: Extract<ModerationStatus, 'confirmed' | 'released' | 'escalated'>;
    resolution?: string;
    reviewerId: string | null;
  },
  userId: string | null,
  handle: AuditHandle = db,
) {
  return handle.transaction(async (tx) => {
    const [before] = await tx.select().from(moderationCase).where(eq(moderationCase.id, id));
    if (!before) return undefined;

    const resolvedAt = new Date();
    const [after] = await tx
      .update(moderationCase)
      .set({ status, resolution: resolution ?? null, reviewerId, resolvedAt, updatedAt: resolvedAt })
      .where(eq(moderationCase.id, id))
      .returning();
    if (!after) return undefined;
    await writeAuditLog(tx, { model: 'ModerationCase', action: 'update', before, after, userId });

    if (status === 'escalated') return after;

    const [fileBefore] = await tx.select().from(file).where(eq(file.id, after.fileId));
    const [fileAfter] = await tx
      .update(file)
      .set(
        status === 'released'
          ? { moderationStatus: 'clear', updatedAt: resolvedAt }
          : { isDeleted: true, deletedAt: resolvedAt, moderationStatus: 'confirmed', updatedAt: resolvedAt },
      )
      .where(eq(file.id, after.fileId))
      .returning();
    if (fileBefore && fileAfter) await writeAuditLog(tx, { model: 'File', action: 'update', before: fileBefore, after: fileAfter, userId });

    return after;
  });
}

/**
 * One page of files the admin rescan should re-check: live, not already
 * quarantined, and carrying at least one hash. Keyset paged by id.
 */
export function listRescanCandidates({ cursor, limit }: { cursor?: string; limit: number }, handle: AuditHandle = db) {
  return handle
    .select({ id: file.id, ownerId: file.ownerId, sha256: file.sha256, md5: file.md5, phash: file.phash })
    .from(file)
    .where(
      and(
        eq(file.isDeleted, false),
        not(statusIs(file.moderationStatus, 'quarantined')),
        or(isNotNull(file.sha256), isNotNull(file.md5), isNotNull(file.phash)),
        cursor ? gt(file.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(file.id))
    .limit(limit);
}
