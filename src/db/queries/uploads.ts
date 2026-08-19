import { and, eq } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { file, fileMetadata, folder } from '../schema/files';
import type { JsonValue } from '../schema/json';
import { normaliseFileHashes } from './files';
import { ensureStorageQuotaAvailable } from './storage';

/**
 * Query module for the two upload paths — the web uploader and ShareX (issue
 * #34). Call sites import these functions and never the `db` handle (issue #15).
 *
 * Both routes previously owned a Prisma transaction each, with admission
 * control, the insert and an explicit audit call written out twice. That whole
 * sequence lives here now, so the rule "quota lock, insert and audit share one
 * transaction" is stated once instead of being re-derived per route.
 *
 * `ensureStorageQuotaAvailable` is imported from the libs layer rather than
 * inlined because it is shared with the AI-generation paths; the handle it
 * needs is the transaction opened below, so it never escapes this module.
 */

/** What both upload routes hand over once the bytes are hashed and scrubbed. */
export type UploadedFileInput = {
  ownerId: string;
  /** Byte length actually stored, after scrubbing and any recompression. */
  size: number;
  /** Object key relative to the owner prefix, already URL-encoded. */
  url: string;
  title: string;
  tags: string;
  contentType: string;
  folderId?: string | null;
  /**
   * The moderation gate rejected the file. Drives both `private` and
   * `moderationStatus`, which have to agree — deriving them here keeps that
   * pairing from drifting between the two routes.
   */
  privateUpload: boolean;
  hashes: { sha256: string; md5: string; phash: string | null };
  scrubReport: JsonValue;
  /** Image dimensions, when they could be determined. */
  dimensions?: { width: number; height: number } | null;
};

/** The file row plus the derived metadata row the web uploader echoes back. */
export type UploadedFile = typeof file.$inferSelect & {
  metadata: { width: number | null; height: number | null } | null;
};

/**
 * Reserves the file row for an upload: quota admission control, the insert, the
 * audit row and the derived metadata row, in one transaction.
 *
 * Admission control and the insert it guards MUST stay in the same transaction.
 * `ensureStorageQuotaAvailable` takes a `FOR UPDATE` row lock, and a lock
 * released before the insert lets two concurrent uploads both see the same free
 * space and both fit.
 *
 * Throws `StorageQuotaExceededError` when the upload does not fit, which both
 * routes translate into a 413.
 *
 * The audit call sits inside the transaction deliberately, and without a
 * try/catch of its own: `writeAuditLog` writes on a SAVEPOINT, which is what
 * lets the audit row share the business write's transaction while a failing
 * audit write still cannot roll it back or corrupt it.
 */
export async function createUploadedFile(input: UploadedFileInput, userId: string | null, handle: AuditHandle = db): Promise<UploadedFile> {
  return handle.transaction(async (tx) => {
    await ensureStorageQuotaAvailable(tx, input.ownerId, input.size);

    const [created] = await tx
      .insert(file)
      .values({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        size: input.size,
        url: input.url,
        title: input.title,
        tags: input.tags,
        contentType: input.contentType,
        folderId: input.folderId ?? null,
        private: input.privateUpload,
        moderationStatus: input.privateUpload ? 'quarantined' : 'clear',
        scrubReport: input.scrubReport,
        // Hex case is normalised on the write path, not just on the read path.
        // Store a hash upper-case and the denylist gate silently stops matching
        // it on Postgres, which is the fail-open case in issues #23 and #42.
        ...normaliseFileHashes(input.hashes),
      })
      .returning();
    if (!created) throw new Error('Failed to reserve uploaded file');

    await writeAuditLog(tx, { model: 'File', action: 'create', after: created, userId });

    // FileMetadata is a derived artifact and deliberately unaudited — see
    // UNAUDITED_MODELS in src/db/audit.ts.
    let metadata: UploadedFile['metadata'] = null;
    if (input.dimensions) {
      const [row] = await tx
        .insert(fileMetadata)
        .values({ id: crypto.randomUUID(), fileId: created.id, width: input.dimensions.width, height: input.dimensions.height })
        .returning({ width: fileMetadata.width, height: fileMetadata.height });
      metadata = row ?? null;
    }

    return { ...created, metadata };
  });
}

/**
 * Undoes a reservation whose object never made it to storage.
 *
 * Prefers a hard delete so a failed upload leaves nothing behind, and falls back
 * to a soft delete when something already references the row (a moderation case,
 * a rendition). Both outcomes are audited: `File` is an audited model, and the
 * Prisma implementation recorded this delete through the query extension.
 */
export async function releaseUploadedFile(id: string, userId: string | null, handle: AuditHandle = db): Promise<void> {
  const [before] = await handle.select().from(file).where(eq(file.id, id));
  if (!before) return;

  try {
    // Its own transaction so a failing delete — a foreign key still pointing at
    // the row — aborts only this attempt and leaves the fallback able to run.
    await handle.transaction(async (tx) => {
      await tx.delete(file).where(eq(file.id, id));
    });
    await writeAuditLog(handle, { model: 'File', action: 'delete', before, userId });
    return;
  } catch {
    // Fall through to the soft delete below.
  }

  const deletedAt = new Date();
  const [after] = await handle.update(file).set({ isDeleted: true, deletedAt, updatedAt: deletedAt }).where(eq(file.id, id)).returning();
  if (after) await writeAuditLog(handle, { model: 'File', action: 'update', before, after, userId });
}

/**
 * Resolves a ShareX token's configured destination folder, ignoring one that was
 * deleted or that no longer belongs to the uploader.
 */
export async function findOwnedActiveFolderId(folderId: string, ownerId: string, handle: AuditHandle = db): Promise<string | null> {
  const [row] = await handle
    .select({ id: folder.id })
    .from(folder)
    .where(and(eq(folder.id, folderId), eq(folder.ownerId, ownerId), eq(folder.isDeleted, false)));
  return row?.id ?? null;
}
