import { eq } from 'drizzle-orm';
import { evaluateQuota, type StorageQuotaDetails } from '@/libs/storage-quota';
import type { Tx } from '../client';
import { db } from '../client';
import { user } from '../schema/auth';
import { storageUsage } from './files';

/**
 * Storage accounting reads (issues #15, #12).
 */

/**
 * Reads an owner's quota under a row lock, so two concurrent uploads cannot both
 * see the same free space and both fit.
 *
 * Prisma had no way to express `FOR UPDATE` and dropped to `$queryRaw` with a
 * hand-written backtick-quoted table name. Drizzle puts row locking on the
 * select builder, so the raw fragment disappears entirely — which also removes
 * the MariaDB-specific quoting that would have been wrong on Postgres anyway
 * (`user` is a reserved word there).
 *
 * Requires a transaction: a row lock outside one is released immediately and
 * buys nothing.
 */
export async function lockUserStorageQuota(userId: string, tx: Tx): Promise<number | null> {
  const [row] = await tx.select({ storageQuotaMiB: user.storageQuotaMiB }).from(user).where(eq(user.id, userId)).for('update');
  return row?.storageQuotaMiB ?? null;
}

/** An owner's quota without locking — for display, never for admission control. */
export async function getUserStorageQuota(userId: string, handle: typeof db | Tx = db): Promise<number | null> {
  const [row] = await handle.select({ storageQuotaMiB: user.storageQuotaMiB }).from(user).where(eq(user.id, userId));
  return row?.storageQuotaMiB ?? null;
}

/**
 * Admission control for an upload. Must run inside a transaction: the quota read
 * takes a row lock so two concurrent uploads cannot both see the same free space
 * and both fit, and a lock outside a transaction is released immediately.
 *
 * It lives here rather than beside the quota constants because it reads the
 * database. `src/libs/storage-quota.ts` is imported by admin routes, so pulling
 * the data-access layer into it drags the whole database module into the client
 * bundle — which is exactly how the production build broke.
 */
export async function ensureStorageQuotaAvailable(tx: Tx, userId: string, incomingBytes: number): Promise<StorageQuotaDetails> {
  const quotaMiB = await lockUserStorageQuota(userId, tx);
  const { totalBytes: usedBytes } = await storageUsage(userId, tx);
  return evaluateQuota(quotaMiB, usedBytes, incomingBytes);
}
