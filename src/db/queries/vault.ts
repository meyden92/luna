import { eq } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { vaultEntry } from '../schema/admin';

type VaultRow = typeof vaultEntry.$inferSelect;

/** The audit snapshot: keyed by the entry name. */
const auditRecord = (row: VaultRow) => ({ id: row.name, ...row });

export async function listVaultRows(handle: AuditHandle = db): Promise<VaultRow[]> {
  return handle.select().from(vaultEntry);
}

export async function upsertVaultRow(name: string, ciphertext: string, userId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.select().from(vaultEntry).where(eq(vaultEntry.name, name));
  if (!before) {
    const [created] = await handle.insert(vaultEntry).values({ name, ciphertext, updatedBy: userId }).returning();
    if (!created) throw new Error('Failed to create Vault entry');
    await writeAuditLog(handle, { model: 'VaultEntry', action: 'create', after: auditRecord(created), userId });
    return created;
  }
  const [after] = await handle
    .update(vaultEntry)
    .set({ ciphertext, updatedBy: userId, updatedAt: new Date() })
    .where(eq(vaultEntry.name, name))
    .returning();
  if (after)
    await writeAuditLog(handle, { model: 'VaultEntry', action: 'update', before: auditRecord(before), after: auditRecord(after), userId });
  return after;
}

export async function deleteVaultRow(name: string, userId: string | null, handle: AuditHandle = db) {
  const [deleted] = await handle.delete(vaultEntry).where(eq(vaultEntry.name, name)).returning();
  if (deleted) await writeAuditLog(handle, { model: 'VaultEntry', action: 'delete', before: auditRecord(deleted), userId });
  return deleted;
}
