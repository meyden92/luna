import { eq } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { sourceSession } from '../schema/downloads';

/**
 * Query module for Source sessions (issue #207): one encrypted cookies file per
 * Source. Callers encrypt and decrypt; this module only stores ciphertext.
 *
 * `SourceSession` is in `AUDITED_MODELS` with `encryptedValue` redacted, so
 * every write below records who changed it and when, never the value.
 */

export type SourceSessionRow = typeof sourceSession.$inferSelect;

/** The Source session of `sourceKey`, or null when none is set. */
export async function getSourceSession(sourceKey: string, handle: AuditHandle = db): Promise<SourceSessionRow | null> {
  const [row] = await handle.select().from(sourceSession).where(eq(sourceSession.sourceKey, sourceKey));
  return row ?? null;
}

/** Every Source session that is set, without its value: what the Sources page shows. */
export function listSourceSessionStates(handle: AuditHandle = db) {
  return handle.select({ sourceKey: sourceSession.sourceKey, updatedAt: sourceSession.updatedAt }).from(sourceSession);
}

/** Sets or replaces the Source session of `sourceKey`. Audited as a create or an update. */
export async function upsertSourceSession(
  { sourceKey, encryptedValue }: { sourceKey: string; encryptedValue: string },
  userId: string | null,
  handle: AuditHandle = db,
): Promise<SourceSessionRow> {
  const before = await getSourceSession(sourceKey, handle);
  const [after] = before
    ? await handle
        .update(sourceSession)
        .set({ encryptedValue, updatedById: userId, updatedAt: new Date() })
        .where(eq(sourceSession.id, before.id))
        .returning()
    : await handle.insert(sourceSession).values({ id: crypto.randomUUID(), sourceKey, encryptedValue, updatedById: userId }).returning();
  if (!after) throw new Error(`Failed to save the Source session of ${sourceKey}`);

  await writeAuditLog(handle, { model: 'SourceSession', action: before ? 'update' : 'create', before, after, userId });
  return after;
}

/** Clears the Source session of `sourceKey`. Audited. False when none was set. */
export async function deleteSourceSession(sourceKey: string, userId: string | null, handle: AuditHandle = db): Promise<boolean> {
  const [before] = await handle.delete(sourceSession).where(eq(sourceSession.sourceKey, sourceKey)).returning();
  if (!before) return false;

  await writeAuditLog(handle, { model: 'SourceSession', action: 'delete', before, userId });
  return true;
}
