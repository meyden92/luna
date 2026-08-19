import { boolean, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { user } from './auth';

/**
 * Standalone user-facing features that don't belong to the files/folders
 * domain: nicotine tracking and one-off "share this form data" links.
 *
 * `nicotine_entry`'s physical columns are ALREADY snake_case in the source
 * dump (unlike `form_share`/`form_share_field`, which are camelCase like the
 * rest of production) — each table's column names are derived individually
 * from the dump rather than assuming one convention (issue #28).
 */
export const nicotineEntry = pgTable(
  'nicotine_entry',
  {
    id: text('id').primaryKey(),
    kind: varchar('kind', { length: 20 }).notNull(),
    note: text('note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // No DEFAULT in the dump -> Prisma's @updatedAt, applied at query level.
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  },
  (t) => [
    index('nicotine_entry_owner_id_occurred_at_idx').on(t.ownerId, t.occurredAt),
    index('nicotine_entry_owner_id_kind_occurred_at_idx').on(t.ownerId, t.kind, t.occurredAt),
  ],
);

export const formShare = pgTable(
  'form_share',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    maxViews: integer('max_views'),
    viewCount: integer('view_count').default(0).notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // No DEFAULT in the dump -> Prisma's @updatedAt, applied at query level.
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    expiresInMs: integer('expires_in_ms'),
  },
  (t) => [index('form_share_ownerId_idx').on(t.ownerId), index('form_share_expiresAt_idx').on(t.expiresAt)],
);

export const formShareField = pgTable(
  'form_share_field',
  {
    id: text('id').primaryKey(),
    formId: text('form_id')
      .notNull()
      .references(() => formShare.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    label: text('label').notNull(),
    // Encrypted payload. Plain `text` (not varchar, not jsonb) is the only
    // faithful choice: varchar's length cap could silently truncate ciphertext,
    // and jsonb parses/canonicalises its input (re-orders keys, drops
    // whitespace) even when the source looks JSON-shaped — either would break
    // the byte-identical round-trip encryption requires. Postgres `text`
    // stores the exact input bytes with no reformatting, matching the source
    // `text NOT NULL` column with no json_valid CHECK.
    value: text('value').notNull(),
    type: text('type').notNull(),
    isSensitive: boolean('is_sensitive').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (t) => [index('form_share_field_formId_idx').on(t.formId)],
);
