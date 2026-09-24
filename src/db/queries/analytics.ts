import { count, desc, eq, sql } from 'drizzle-orm';
import type { AuditHandle } from '../audit';
import { db } from '../client';
import { egressRollup } from '../schema/analytics';
import { user } from '../schema/auth';
import { file } from '../schema/files';

/**
 * Query module for analytics: egress accounting and the landing-page counters
 * (issue #15). Same contract as the files and folders modules — call sites import
 * named functions, the handle stays internal, and it comes last so a caller can
 * compose into its own transaction.
 *
 * `EgressRollup` is in `UNAUDITED_MODELS` ('analytics'), so there is no
 * `writeAuditLog` call anywhere in this file and there must never be one.
 *
 * The reads here are grouping or aggregation, which the relational query API
 * cannot express at all (issue #21), so this module is core selects throughout.
 */

/**
 * The bucket definition for `egress_rollup.period`. `toISOString()` is UTC by
 * definition regardless of the process timezone, which keeps it aligned with the
 * `timestamptz` columns under a database TimeZone pinned to UTC (issue #23).
 */
export function utcMonth(at: Date): string {
  return at.toISOString().slice(0, 7);
}

/**
 * Adds one request's bytes to the owner's monthly rollup. Both key columns are
 * NOT NULL, so a single `ON CONFLICT DO UPDATE` cannot lose a concurrent request.
 */
export async function upsertEgressRollup(
  { ownerId, period, bytes }: { ownerId: string; period: string; bytes: number },
  handle: AuditHandle = db,
): Promise<void> {
  const now = new Date();
  await handle
    .insert(egressRollup)
    .values({ id: crypto.randomUUID(), ownerId, period, bytes, requestCount: 1, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [egressRollup.period, egressRollup.ownerId],
      set: {
        bytes: sql`${egressRollup.bytes} + ${bytes}`,
        requestCount: sql`${egressRollup.requestCount} + 1`,
        updatedAt: now,
      },
    });
}

/** The heaviest owners across the whole platform in a period — one rollup row per owner. */
export function listTopEgressOwners({ period, limit }: { period: string; limit: number }, handle: AuditHandle = db) {
  return handle
    .select({ ownerId: egressRollup.ownerId, bytes: egressRollup.bytes, requestCount: egressRollup.requestCount })
    .from(egressRollup)
    .where(eq(egressRollup.period, period))
    .orderBy(desc(egressRollup.bytes))
    .limit(limit);
}

/**
 * The two counters on the public landing page. They span `user` and `file` and
 * belong to neither domain's module, so they live with the other statistics
 * surfaces rather than forcing an owner.
 */
export async function getLandingCounts(handle: AuditHandle = db) {
  const [users, files] = await Promise.all([
    handle.select({ total: count() }).from(user).where(eq(user.isDeleted, false)),
    handle.select({ total: count() }).from(file).where(eq(file.isDeleted, false)),
  ]);
  return { userCount: Number(users[0]?.total ?? 0), fileCount: Number(files[0]?.total ?? 0) };
}
