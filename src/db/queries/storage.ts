import { eq } from 'drizzle-orm';
import type { Tx } from '../client';
import { db } from '../client';
import { user } from '../schema/auth';

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
