import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { JsonValue } from './json';

/**
 * Analytics domain: view tracking (`view_event`, `view_daily_rollup`) and
 * egress/bandwidth tracking (`egress_event`, `egress_rollup`) for issue #17's
 * Prisma -> Drizzle + PostgreSQL migration.
 *
 * These four tables are the only ones with `bigint`/`double` columns in the
 * source schema, and none of them carry foreign keys in the source DDL — the
 * `ownerId`/`fileId`/`tokenId`/`formShareId` references are informal, unlike
 * elsewhere in the schema.
 *
 * Type choices follow issue #23: Json -> jsonb, DateTime -> timestamptz with
 * the database TimeZone pinned to UTC, tinyint(1) -> boolean, bigint(20) ->
 * bigint(mode: 'number'). The varchar(191) sizing is deliberately absent — an
 * InnoDB 767-byte artifact with no Postgres equivalent.
 */

export const viewEvent = pgTable(
  'view_event',
  {
    id: text('id').primaryKey(),
    targetKind: varchar('target_kind', { length: 32 }).notNull(),
    targetId: text('target_id').notNull(),
    ownerId: text('owner_id'),
    country: varchar('country', { length: 2 }),
    referrerHost: text('referrer_host'),
    deviceClass: varchar('device_class', { length: 20 }).default('desktop').notNull(),
    visitorHash: varchar('visitor_hash', { length: 64 }).notNull(),
    serverMs: integer('server_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('view_event_targetKind_targetId_createdAt_idx').on(t.targetKind, t.targetId, t.createdAt),
    index('view_event_ownerId_createdAt_idx').on(t.ownerId, t.createdAt),
    index('view_event_visitorHash_idx').on(t.visitorHash),
  ],
);

export const viewDailyRollup = pgTable(
  'view_daily_rollup',
  {
    id: text('id').primaryKey(),
    targetKind: varchar('target_kind', { length: 32 }).notNull(),
    targetId: text('target_id').notNull(),
    ownerId: text('owner_id'),
    // UTC calendar day bucket (e.g. "2026-08-19"), computed at write time.
    // Issue #23 pins the database TimeZone to UTC — a day boundary computed
    // in any other zone would shift which rows land in which bucket.
    day: varchar('day', { length: 10 }).notNull(),
    views: integer('views').default(0).notNull(),
    uniques: integer('uniques').default(0).notNull(),
    referrerBreakdown: jsonb('referrer_breakdown').$type<JsonValue>(),
    countryBreakdown: jsonb('country_breakdown').$type<JsonValue>(),
    deviceBreakdown: jsonb('device_breakdown').$type<JsonValue>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Prisma applied @updatedAt at query level, not in the database — the
    // data-access layer owns this now (issue #23).
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('view_daily_rollup_targetKind_targetId_day_key').on(t.targetKind, t.targetId, t.day),
    index('view_daily_rollup_ownerId_day_idx').on(t.ownerId, t.day),
  ],
);

export const egressEvent = pgTable(
  'egress_event',
  {
    id: text('id').primaryKey(),
    fileId: text('file_id'),
    ownerId: text('owner_id').notNull(),
    tokenId: text('token_id'),
    formShareId: text('form_share_id'),
    rendition: varchar('rendition', { length: 32 }).default('original').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    wasEstimated: boolean('was_estimated').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('egress_event_ownerId_createdAt_idx').on(t.ownerId, t.createdAt),
    index('egress_event_fileId_createdAt_idx').on(t.fileId, t.createdAt),
    index('egress_event_tokenId_createdAt_idx').on(t.tokenId, t.createdAt),
  ],
);

export const egressRollup = pgTable(
  'egress_rollup',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    fileId: text('file_id'),
    tokenId: text('token_id'),
    rendition: varchar('rendition', { length: 32 }).default('original').notNull(),
    // UTC calendar month bucket (e.g. "2026-08"), computed at write time.
    // Same UTC-boundary concern as view_daily_rollup.day (issue #23).
    period: varchar('period', { length: 7 }).notNull(),
    bytes: bigint('bytes', { mode: 'number' }).default(0).notNull(),
    requestCount: integer('request_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('egress_rollup_ownerId_period_fileId_tokenId_rendition_key').on(t.ownerId, t.period, t.fileId, t.tokenId, t.rendition),
    index('egress_rollup_ownerId_period_idx').on(t.ownerId, t.period),
    index('egress_rollup_fileId_period_idx').on(t.fileId, t.period),
  ],
);
