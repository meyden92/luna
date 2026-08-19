import type { AnyColumn } from 'drizzle-orm';
import { and, count, desc, eq, gte, isNotNull, isNull, sql, sum } from 'drizzle-orm';
import type { AuditHandle } from '../audit';
import { db } from '../client';
import { egressEvent, egressRollup, viewDailyRollup, viewEvent } from '../schema/analytics';
import { user } from '../schema/auth';
import { formShare } from '../schema/features';
import { file } from '../schema/files';

/**
 * Query module for analytics: view tracking, egress accounting and their rollups
 * (issue #15). Same contract as the files and folders modules — call sites import
 * named functions, the handle stays internal, and it comes last so a caller can
 * compose into its own transaction.
 *
 * NONE of the four models here are audited. `ViewEvent`, `ViewDailyRollup`,
 * `EgressEvent` and `EgressRollup` are all in `UNAUDITED_MODELS` ('analytics'),
 * so there is no `writeAuditLog` call anywhere in this file and there must never
 * be one. The Prisma extension audited everything it could intercept and
 * deliberately never reached the view-recording transaction; the explicit port
 * keeps that outcome on purpose rather than by accident.
 *
 * Almost every read here is grouping or aggregation, which the relational query
 * API cannot express at all (issue #21), so this module is core selects
 * throughout.
 */

/**
 * The bucket definitions for `view_daily_rollup.day` and `egress_rollup.period`.
 *
 * Both are string buckets, and `toISOString()` is UTC by definition regardless of
 * the process timezone — which is what keeps them aligned with the `timestamptz`
 * columns under a database TimeZone pinned to UTC (issue #23). A day boundary
 * computed in local time would quietly shift every bucket with no error.
 *
 * Callers pass the bucket in rather than each function calling `new Date()`, so
 * one request's event, rollup and summary can never straddle a boundary.
 */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function utcMonth(at: Date): string {
  return at.toISOString().slice(0, 7);
}

/** Midnight UTC that opens `day`, for range-filtering `created_at`. */
function startOfUtcDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Prisma translated `{ fileId: null }` to `IS NULL`; Drizzle's `eq(col, null)`
 * renders `= NULL`, which is never true. The egress rollup key has two nullable
 * columns, so every lookup would miss and every request would insert a new row.
 */
function eqOrNull(column: AnyColumn, value: string | null) {
  return value === null ? isNull(column) : eq(column, value);
}

/**
 * Increments one key of a jsonb counter map in SQL, so the rollup upsert needs no
 * read-modify-write round trip. Merging with `||` overwrites just that key and
 * leaves the rest of the map intact; a null key (no referrer, no country header)
 * leaves the map untouched.
 */
function bumpBreakdown(column: AnyColumn, key: string | null) {
  const current = sql`coalesce(${column}, '{}'::jsonb)`;
  if (!key) return current;
  return sql`${current} || jsonb_build_object(${key}::text, coalesce((${column} ->> ${key}::text)::int, 0) + 1)`;
}

export type RecordViewInput = {
  targetKind: string;
  targetId: string;
  ownerId: string | null;
  /** UTC calendar day, from `utcDay(createdAt)`. */
  day: string;
  createdAt: Date;
  visitorHash: string;
  country: string | null;
  referrerHost: string | null;
  deviceClass: string;
  serverMs: number | null;
};

/**
 * Records one view and folds it into the day's rollup, in a single transaction.
 *
 * The rollup is an `ON CONFLICT DO UPDATE` rather than the read-then-branch the
 * Prisma version used: it is one statement instead of two, which matters on a hot
 * read path, and it cannot lose a concurrent view. That is safe here precisely
 * because all three columns of `view_daily_rollup_targetKind_targetId_day_key`
 * are NOT NULL — the egress rollup below has nullable key columns and so cannot
 * use the same shape.
 *
 * `visitorHash` is deliberately NOT case-normalised. It is only ever produced by
 * `createHmac(...).digest('hex')`, which is lower-case hex on both the write and
 * the read side, so no case boundary exists for issue #23 to bite; the data
 * migration reached the same conclusion and left `view_event.visitorHash` alone.
 */
export async function recordView(input: RecordViewInput, handle: AuditHandle = db): Promise<void> {
  const { targetKind, targetId, ownerId, day, createdAt, visitorHash, country, referrerHost, deviceClass, serverMs } = input;

  await handle.transaction(async (tx) => {
    // Checked before the insert below, so the view being recorded never counts
    // itself as a returning visitor.
    const [seenToday] = await tx
      .select({ id: viewEvent.id })
      .from(viewEvent)
      .where(
        and(
          eq(viewEvent.targetKind, targetKind),
          eq(viewEvent.targetId, targetId),
          eq(viewEvent.visitorHash, visitorHash),
          gte(viewEvent.createdAt, startOfUtcDay(day)),
        ),
      )
      .limit(1);

    await tx.insert(viewEvent).values({
      id: crypto.randomUUID(),
      targetKind,
      targetId,
      ownerId,
      country,
      referrerHost,
      deviceClass,
      visitorHash,
      serverMs,
      createdAt,
    });

    const uniqueDelta = seenToday ? 0 : 1;
    await tx
      .insert(viewDailyRollup)
      .values({
        id: crypto.randomUUID(),
        targetKind,
        targetId,
        ownerId,
        day,
        views: 1,
        uniques: 1,
        referrerBreakdown: referrerHost ? { [referrerHost]: 1 } : {},
        countryBreakdown: country ? { [country]: 1 } : {},
        deviceBreakdown: { [deviceClass]: 1 },
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoUpdate({
        target: [viewDailyRollup.targetKind, viewDailyRollup.targetId, viewDailyRollup.day],
        set: {
          views: sql`${viewDailyRollup.views} + 1`,
          uniques: sql`${viewDailyRollup.uniques} + ${uniqueDelta}`,
          referrerBreakdown: bumpBreakdown(viewDailyRollup.referrerBreakdown, referrerHost),
          countryBreakdown: bumpBreakdown(viewDailyRollup.countryBreakdown, country),
          deviceBreakdown: bumpBreakdown(viewDailyRollup.deviceBreakdown, deviceClass),
          // Prisma applied @updatedAt at query level; the data-access layer owns
          // it now (issue #23).
          updatedAt: createdAt,
        },
      });
  });
}

/**
 * Daily rollups for one target the owner owns, newest day first.
 *
 * `day` is a fixed-width `YYYY-MM-DD` string, so lexicographic ordering is
 * chronological ordering and no collation difference can reorder it.
 */
export function listTargetDailyRollups(
  { targetKind, targetId, ownerId, limit }: { targetKind: string; targetId: string; ownerId: string; limit: number },
  handle: AuditHandle = db,
) {
  return handle
    .select()
    .from(viewDailyRollup)
    .where(and(eq(viewDailyRollup.targetKind, targetKind), eq(viewDailyRollup.targetId, targetId), eq(viewDailyRollup.ownerId, ownerId)))
    .orderBy(desc(viewDailyRollup.day))
    .limit(limit);
}

/** Every daily rollup for an owner, newest day first, capped at `limit`. */
export function listOwnerDailyRollups(ownerId: string, limit: number, handle: AuditHandle = db) {
  return handle.select().from(viewDailyRollup).where(eq(viewDailyRollup.ownerId, ownerId)).orderBy(desc(viewDailyRollup.day)).limit(limit);
}

export type RecordEgressInput = {
  ownerId: string;
  /** UTC calendar month, from `utcMonth(...)`. */
  period: string;
  bytes: number;
  fileId: string | null;
  tokenId: string | null;
  rendition: string;
};

/**
 * Adds one request's bytes to the owner's monthly rollup.
 *
 * Read-then-write rather than `ON CONFLICT DO UPDATE`, because
 * `egress_rollup_ownerId_period_fileId_tokenId_rendition_key` has two nullable
 * columns and Postgres treats NULLs as distinct in a unique index. A conflict
 * target over that index would simply never fire for the common case
 * (`tokenId IS NULL`) and every request would insert a fresh row.
 */
export async function upsertEgressRollup(input: RecordEgressInput, handle: AuditHandle = db): Promise<void> {
  const { ownerId, period, bytes, fileId, tokenId, rendition } = input;

  const [existing] = await handle
    .select({ id: egressRollup.id })
    .from(egressRollup)
    .where(
      and(
        eq(egressRollup.ownerId, ownerId),
        eq(egressRollup.period, period),
        eqOrNull(egressRollup.fileId, fileId),
        eqOrNull(egressRollup.tokenId, tokenId),
        eq(egressRollup.rendition, rendition),
      ),
    )
    .limit(1);

  if (existing) {
    await handle
      .update(egressRollup)
      .set({
        bytes: sql`${egressRollup.bytes} + ${bytes}`,
        requestCount: sql`${egressRollup.requestCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(egressRollup.id, existing.id));
    return;
  }

  await handle
    .insert(egressRollup)
    .values({ id: crypto.randomUUID(), ownerId, period, fileId, tokenId, rendition, bytes, requestCount: 1 });
}

/** The per-request egress record behind the rollup. */
export function insertEgressEvent(
  input: {
    ownerId: string;
    bytes: number;
    fileId: string | null;
    tokenId: string | null;
    formShareId: string | null;
    rendition: string;
    wasEstimated: boolean;
  },
  handle: AuditHandle = db,
) {
  return handle.insert(egressEvent).values({ id: crypto.randomUUID(), ...input });
}

/**
 * Bytes and request count for one owner in one period. An aggregate over the
 * rollups, so a core select (issue #21). `sum()` returns a string because the
 * total can exceed a safe integer, which is also the shape the API already
 * returns — Prisma handed back a bigint and the caller stringified it.
 */
export async function getEgressPeriodTotals(ownerId: string, period: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ bytes: sum(egressRollup.bytes), requestCount: sum(egressRollup.requestCount) })
    .from(egressRollup)
    .where(and(eq(egressRollup.ownerId, ownerId), eq(egressRollup.period, period)));
  return { bytes: row?.bytes ?? '0', requestCount: Number(row?.requestCount ?? 0) };
}

/** The owner's heaviest files in a period. File-scoped rollup rows only. */
export function listTopEgressFiles(
  { ownerId, period, limit }: { ownerId: string; period: string; limit: number },
  handle: AuditHandle = db,
) {
  return handle
    .select({
      fileId: egressRollup.fileId,
      bytes: egressRollup.bytes,
      requestCount: egressRollup.requestCount,
      rendition: egressRollup.rendition,
    })
    .from(egressRollup)
    .where(and(eq(egressRollup.ownerId, ownerId), eq(egressRollup.period, period), isNotNull(egressRollup.fileId)))
    .orderBy(desc(egressRollup.bytes))
    .limit(limit);
}

/**
 * The heaviest owners across the whole platform in a period — Prisma's
 * `groupBy(['ownerId'])` with an ordered `_sum`, which the relational API cannot
 * express, so an explicit `GROUP BY` (issue #21).
 */
export function listTopEgressOwners({ period, limit }: { period: string; limit: number }, handle: AuditHandle = db) {
  const totalBytes = sum(egressRollup.bytes);
  return handle
    .select({ ownerId: egressRollup.ownerId, bytes: totalBytes, requestCount: sum(egressRollup.requestCount) })
    .from(egressRollup)
    .where(eq(egressRollup.period, period))
    .groupBy(egressRollup.ownerId)
    .orderBy(desc(totalBytes))
    .limit(limit);
}

/** Ownership check for the form-share view-stats surface. */
export async function getOwnedFormShareId(id: string, ownerId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ id: formShare.id })
    .from(formShare)
    .where(and(eq(formShare.id, id), eq(formShare.ownerId, ownerId)))
    .limit(1);
  return row;
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
