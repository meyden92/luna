import { bigint, integer, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

/**
 * Analytics domain: per-owner monthly egress/bandwidth totals (`egress_rollup`),
 * read by the admin "top egress consumers" page.
 *
 * `ownerId` is an informal reference with no foreign key, as in the source DDL.
 * Type choices follow issue #23: DateTime -> timestamptz with the database
 * TimeZone pinned to UTC, bigint(20) -> bigint(mode: 'number').
 */

export const egressRollup = pgTable(
  'egress_rollup',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    // UTC calendar month bucket (e.g. "2026-08"), computed at write time. A
    // bucket computed in any other zone would shift which rows land where
    // (issue #23).
    period: varchar('period', { length: 7 }).notNull(),
    bytes: bigint('bytes', { mode: 'number' }).default(0).notNull(),
    requestCount: integer('request_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // Period first: it is both the upsert's conflict target and the admin
  // page's filter.
  (t) => [uniqueIndex('egress_rollup_period_ownerId_key').on(t.period, t.ownerId)],
);
