import { and, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '../client';
import { file } from '../schema/files';

/**
 * Query module for files (issue #15). Call sites import these functions, never
 * the `db` handle — that boundary is what makes "no Prisma imports remain"
 * provable rather than assumed.
 *
 * Hash lookups normalise hex case here rather than relying on the column type.
 * MariaDB's utf8mb4_unicode_ci matched case-insensitively; Postgres `text` does
 * not, and issue #23 showed the moderation denylist fails OPEN when it differs.
 * Normalising in one reviewable place beats remembering citext at each site.
 */
export function normaliseHash(hash: string): string {
  return hash.toLowerCase();
}

/**
 * Hashes must be normalised on the WRITE path too, not just on read.
 * Proven by the reference slice: with a value stored uppercase, a
 * case-normalised *read* still returns zero rows. Normalising one side is a
 * silent half-fix, which is the failure mode issue #23 warned about.
 */
export function insertFileValues<T extends { sha256?: string | null; md5?: string | null; phash?: string | null }>(values: T): T {
  return {
    ...values,
    sha256: values.sha256 ? normaliseHash(values.sha256) : values.sha256,
    md5: values.md5 ? normaliseHash(values.md5) : values.md5,
    phash: values.phash ? normaliseHash(values.phash) : values.phash,
  };
}

/** A file with its owner and optional folder — the dominant include shape. */
export function getFileWithOwner(db: Db, id: string) {
  return db.query.file.findFirst({
    where: { id },
    with: { owner: true, folder: true },
  });
}

/** Owner's active files, newest first — the listing query. */
export function listOwnerFiles(db: Db, ownerId: string, limit = 50) {
  return db.query.file.findMany({
    where: { ownerId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    limit,
    with: { folder: true },
  });
}

/** Exact hash lookup, case-normalised. Mirrors the moderation gate's shape. */
export function findBySha256(db: Db, sha256: string) {
  return db
    .select({ id: file.id })
    .from(file)
    .where(eq(file.sha256, normaliseHash(sha256)));
}

/** Soft-delete, returning the row so the caller can audit the change. */
export function softDeleteFile(db: Db, id: string) {
  return db
    .update(file)
    .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(file.id, id), eq(file.isDeleted, false)))
    .returning();
}

/** Files older than a cutoff — exercises a core select alongside the relational API. */
export function listStaleFiles(db: Db, before: Date) {
  return db.select().from(file).where(lt(file.createdAt, before)).orderBy(desc(file.createdAt));
}
