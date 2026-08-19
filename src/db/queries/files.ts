import type { SQL } from 'drizzle-orm';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, not, or, sql, sum } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { file, fileMetadata, folder } from '../schema/files';
import { containsInsensitive } from './like';

/**
 * Query module for files (issue #15). Call sites import these functions and
 * never the `db` handle — that boundary is what makes "no Prisma imports
 * remain" provable rather than assumed, gives the collation remedies one
 * reviewable place each instead of ~200 inline reads, and makes audited writes
 * unforgettable because the audit call lives inside the write function.
 *
 * Functions take the handle last and default it to the module's own `db`, so a
 * caller composes a write into its transaction by passing `tx` and otherwise
 * passes nothing. The exception is `getFileWithOwner`, which uses the relational
 * query API: that must be called on the concrete `db` handle, because a
 * `Db | Tx` union widens jsonb columns back to `unknown` and TanStack Start then
 * refuses to serialise the row.
 */

/**
 * Hex hashes are normalised here rather than relying on the column type.
 * MariaDB's utf8mb4_unicode_ci matched case-insensitively; Postgres `text` does
 * not, and issue #23 showed the moderation denylist then fails OPEN. Normalising
 * in one reviewable place beats remembering `citext` at each site.
 */
export function normaliseHash(hash: string): string {
  return hash.toLowerCase();
}

/**
 * Hashes must be normalised on the WRITE path too, not just on read. Proven by
 * the reference slice: with a value stored uppercase, a case-normalised *read*
 * still returns zero rows. Normalising one side is a silent half-fix, which is
 * the failure mode issue #23 warned about.
 */
export function normaliseFileHashes<T extends { sha256?: string | null; md5?: string | null; phash?: string | null }>(values: T): T {
  return {
    ...values,
    sha256: values.sha256 ? normaliseHash(values.sha256) : values.sha256,
    md5: values.md5 ? normaliseHash(values.md5) : values.md5,
    phash: values.phash ? normaliseHash(values.phash) : values.phash,
  };
}

export type GalleryFilters = {
  cursor?: string;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
  fileType?: 'image' | 'video' | 'file';
  fileTypeOperator?: 'is' | 'is not';
  folderId?: string | null;
  privacy?: 'public' | 'private';
  tags?: string[];
  tagsOperator?: 'is' | 'is not' | 'one of' | 'none of';
  excludeFoldered?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'size';
  sortDirection?: 'asc' | 'desc';
};

const SORT_COLUMNS = {
  createdAt: file.createdAt,
  updatedAt: file.updatedAt,
  name: file.title,
  size: file.size,
} as const;

/**
 * The gallery listing — the heaviest query in the application.
 *
 * A core select rather than the relational API: the filter set needs OR-groups
 * and negation the relational `where` DSL cannot express, and the keyset cursor
 * has to be written explicitly to keep using the composite index
 * `file_ownerId_isDeleted_createdAt_id_idx`.
 *
 * Prisma's offset-style `cursor` + `skip: 1` becomes a row-value comparison
 * against the cursor row's sort key. That is the same result and it stays on the
 * index, where a growing OFFSET would not.
 */
export async function listGallery(ownerId: string, filters: GalleryFilters, handle: AuditHandle = db) {
  const {
    cursor,
    limit = 10,
    search,
    startDate,
    endDate,
    fileType,
    fileTypeOperator,
    folderId,
    privacy,
    tags,
    tagsOperator,
    excludeFoldered,
    sortBy = 'createdAt',
    sortDirection = 'desc',
  } = filters;

  const conditions: (SQL | undefined)[] = [eq(file.ownerId, ownerId), eq(file.isDeleted, false)];

  if (folderId) conditions.push(eq(file.folderId, folderId));
  else if (excludeFoldered) conditions.push(sql`${file.folderId} IS NULL`);

  if (search) {
    conditions.push(or(containsInsensitive(file.title, search), containsInsensitive(file.tags, search)));
  }
  if (startDate) conditions.push(gte(file.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(file.createdAt, new Date(endDate)));

  const isImage = ilike(file.contentType, 'image/%');
  const isVideo = ilike(file.contentType, 'video/%');
  if (fileType) {
    const negated = fileTypeOperator === 'is not';
    const matcher = fileType === 'image' ? isImage : fileType === 'video' ? isVideo : or(isImage, isVideo);
    // 'file' means "neither image nor video", so its polarity is inverted.
    const wantsMatch = fileType === 'file' ? negated : !negated;
    conditions.push(wantsMatch ? matcher : not(matcher as SQL));
  }

  if (privacy) conditions.push(eq(file.private, privacy === 'private'));

  const tagList = (tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  if (tagList.length > 0) {
    const anyTag = or(...tagList.map((tag) => containsInsensitive(file.tags, tag)));
    const negated = tagsOperator === 'is not' || tagsOperator === 'none of';
    conditions.push(negated ? not(anyTag as SQL) : anyTag);
  }

  const sortColumn = SORT_COLUMNS[sortBy] ?? file.createdAt;
  const descending = sortDirection === 'desc';

  if (cursor) {
    // Row-value comparison, so the pair (sortColumn, id) is compared as a tuple
    // and ties on the sort column cannot drop or repeat a row across pages.
    const cursorRow = sql`(SELECT ${sortColumn} FROM ${file} WHERE ${file.id} = ${cursor})`;
    conditions.push(
      descending
        ? sql`(${sortColumn}, ${file.id}) < (${cursorRow}, ${cursor})`
        : sql`(${sortColumn}, ${file.id}) > (${cursorRow}, ${cursor})`,
    );
  }

  const direction = descending ? desc : asc;
  const rows = await handle
    .select({
      id: file.id,
      title: file.title,
      createdAt: file.createdAt,
      ownerId: file.ownerId,
      folderId: file.folderId,
      tags: file.tags,
      url: file.url,
      private: file.private,
      size: file.size,
      contentType: file.contentType,
      metadata: { width: fileMetadata.width, height: fileMetadata.height, duration: fileMetadata.duration },
      folder: { id: folder.id, name: folder.name, color: folder.color },
    })
    .from(file)
    .leftJoin(fileMetadata, eq(fileMetadata.fileId, file.id))
    .leftJoin(folder, eq(folder.id, file.folderId))
    .where(and(...conditions))
    .orderBy(direction(sortColumn), direction(file.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const files = hasNextPage ? rows.slice(0, limit) : rows;
  return { files, nextCursor: hasNextPage ? (files[files.length - 1]?.id ?? null) : null };
}

/** One active file the owner owns, or undefined. */
export async function getOwnedFile(id: string, ownerId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select()
    .from(file)
    .where(and(eq(file.id, id), eq(file.ownerId, ownerId)));
  return row;
}

/** A file with its owner and optional folder — the dominant include shape. */
export function getFileWithOwner(id: string) {
  return db.query.file.findFirst({ where: { id }, with: { owner: true, folder: true } });
}

/** The owner's active files among `ids`. Used before any bulk mutation. */
export async function listOwnedActiveFiles(ids: string[], ownerId: string, handle: AuditHandle = db) {
  if (ids.length === 0) return [];
  return handle
    .select()
    .from(file)
    .where(and(inArray(file.id, ids), eq(file.ownerId, ownerId), eq(file.isDeleted, false)));
}

/** The owner's live files created within a range, id and title only. */
export function listOwnedFilesInRange({ ownerId, from, to }: { ownerId: string; from: Date; to: Date }, handle: AuditHandle = db) {
  return handle
    .select({ id: file.id, title: file.title })
    .from(file)
    .where(and(eq(file.ownerId, ownerId), eq(file.isDeleted, false), gte(file.createdAt, from), lte(file.createdAt, to)));
}

/** Exact hash lookup, case-normalised. Mirrors the moderation gate's shape. */
export function findBySha256(sha256: string, handle: AuditHandle = db) {
  return handle
    .select({ id: file.id })
    .from(file)
    .where(eq(file.sha256, normaliseHash(sha256)));
}

/** Total bytes and file count for an owner — an aggregate, so a core select. */
export async function storageUsage(ownerId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ totalBytes: sum(file.size), fileCount: count() })
    .from(file)
    .where(and(eq(file.ownerId, ownerId), eq(file.isDeleted, false)));
  return { totalBytes: Number(row?.totalBytes ?? 0), fileCount: Number(row?.fileCount ?? 0) };
}

/**
 * Updates a file the owner owns, auditing the change. Returns the updated row
 * with its metadata, matching the shape the gallery expects.
 *
 * `updatedAt` is set here because Prisma applied `@updatedAt` at query level
 * rather than in the database, so the data-access layer owns it now (issue #23).
 */
export async function updateOwnedFile(
  {
    id,
    ownerId,
    values,
    metadata,
  }: {
    id: string;
    ownerId: string;
    values: Partial<typeof file.$inferInsert>;
    metadata?: { artist?: string; lyrics?: string };
  },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const before = await getOwnedFile(id, ownerId, handle);
  if (!before) return undefined;

  const [after] = await handle
    .update(file)
    .set({ ...normaliseFileHashes(values), updatedAt: new Date() })
    .where(and(eq(file.id, id), eq(file.ownerId, ownerId)))
    .returning();

  if (metadata) {
    await handle
      .insert(fileMetadata)
      .values({ id: crypto.randomUUID(), fileId: id, artist: metadata.artist ?? '', lyrics: metadata.lyrics ?? '' })
      .onConflictDoUpdate({
        target: fileMetadata.fileId,
        set: { artist: metadata.artist ?? '', lyrics: metadata.lyrics ?? '', updatedAt: new Date() },
      });
  }

  if (after) await writeAuditLog(handle, { model: 'File', action: 'update', before, after, userId });
  return after;
}

/** The file's metadata row, or undefined. */
export async function getFileMetadata(fileId: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(fileMetadata).where(eq(fileMetadata.fileId, fileId));
  return row;
}

/**
 * Soft-deletes files, setting the flag and the timestamp together, and audits
 * each one. Returns the rows as they were before deletion, which is what the
 * callers hand back to the client.
 */
export async function softDeleteFiles(ids: string[], ownerId: string, userId: string | null, handle: AuditHandle = db) {
  const before = await listOwnedActiveFiles(ids, ownerId, handle);
  if (before.length === 0) return [];

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
        eq(file.ownerId, ownerId),
        eq(file.isDeleted, false),
      ),
    )
    .returning();

  const afterById = new Map(after.map((row) => [row.id, row]));
  for (const row of before) {
    const updated = afterById.get(row.id);
    if (updated) await writeAuditLog(handle, { model: 'File', action: 'update', before: row, after: updated, userId });
  }
  return before;
}

/** Moves files into a folder, or out of one when `folderId` is null. Audited. */
export async function moveFilesToFolder(
  { ids, ownerId, folderId }: { ids: string[]; ownerId: string; folderId: string | null },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const before = await listOwnedActiveFiles(ids, ownerId, handle);
  if (before.length === 0) return { updated: 0, folderId };

  const after = await handle
    .update(file)
    .set({ folderId, updatedAt: new Date() })
    .where(
      and(
        inArray(
          file.id,
          before.map((row) => row.id),
        ),
        eq(file.ownerId, ownerId),
      ),
    )
    .returning();

  const afterById = new Map(after.map((row) => [row.id, row]));
  for (const row of before) {
    const updated = afterById.get(row.id);
    if (updated) await writeAuditLog(handle, { model: 'File', action: 'update', before: row, after: updated, userId });
  }
  return { updated: after.length, folderId };
}

/** Clears the folder from every file in it. Used when a folder is deleted. */
export async function detachFilesFromFolder(folderId: string, ownerId: string, userId: string | null, handle: AuditHandle = db) {
  const before = await handle
    .select()
    .from(file)
    .where(and(eq(file.folderId, folderId), eq(file.ownerId, ownerId)));
  if (before.length === 0) return 0;

  const after = await handle
    .update(file)
    .set({ folderId: null, updatedAt: new Date() })
    .where(and(eq(file.folderId, folderId), eq(file.ownerId, ownerId)))
    .returning();

  const afterById = new Map(after.map((row) => [row.id, row]));
  for (const row of before) {
    const updated = afterById.get(row.id);
    if (updated) await writeAuditLog(handle, { model: 'File', action: 'update', before: row, after: updated, userId });
  }
  return after.length;
}
