import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Reference slice for the Prisma -> Drizzle + PostgreSQL migration (issue #17).
 *
 * PHYSICAL COLUMN NAMES ARE snake_case; TypeScript properties stay camelCase
 * (issue #28). Production has 120 camelCase columns because Prisma used its
 * field names verbatim — those are renamed by the migration transform, which
 * already rewrites every row (issue #24), so the rename is nearly free.
 * Better-Auth is unaffected: its adapter resolves fields against Drizzle's TS
 * property names, never the physical column.
 *
 * Type choices follow issue #23: Json -> jsonb, DateTime -> timestamptz with the
 * database TimeZone pinned to UTC, tinyint(1) -> boolean. The varchar(191)
 * sizing and prefix-length indexes are deliberately absent — InnoDB 767-byte
 * artifacts with no Postgres equivalent.
 */
export const file = pgTable(
  'file',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    tags: text('tags'),
    size: integer('size').notNull(),
    private: boolean('private').default(false).notNull(),
    contentType: text('content_type').notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // Case-sensitive on Postgres, case-insensitive on MariaDB
    // (utf8mb4_unicode_ci). Issue #23 requires hex normalised on write and
    // read — the column type alone does not make these safe.
    sha256: varchar('sha256', { length: 64 }),
    md5: varchar('md5', { length: 32 }),
    phash: varchar('phash', { length: 64 }),
    scrubReport: jsonb('scrub_report'),
    moderationStatus: varchar('moderation_status', { length: 32 }).default('clear').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Prisma applied @updatedAt at query level, not in the database — the
    // data-access layer owns this now (issue #23).
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ownerId: text('owner_id').notNull(),
    folderId: text('folder_id'),
  },
  (t) => [
    index('file_ownerId_idx').on(t.ownerId),
    index('file_folderId_idx').on(t.folderId),
    index('file_sha256_idx').on(t.sha256),
    index('file_md5_idx').on(t.md5),
    index('file_phash_idx').on(t.phash),
    index('file_moderationStatus_idx').on(t.moderationStatus),
    index('file_owner_deleted_created_id_idx').on(t.ownerId, t.isDeleted, t.createdAt, t.id),
    index('file_owner_deleted_folder_created_id_idx').on(t.ownerId, t.isDeleted, t.folderId, t.createdAt, t.id),
  ],
);

export const folder = pgTable(
  'folder',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    color: varchar('color', { length: 7 }),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ownerId: text('owner_id').notNull(),
  },
  (t) => [index('folder_ownerId_idx').on(t.ownerId)],
);

export const fileMetadata = pgTable('file_metadata', {
  id: text('id').primaryKey(),
  fileId: text('file_id').notNull().unique(),
  artist: text('artist'),
  description: text('description'),
  genre: text('genre'),
  lyrics: text('lyrics'),
  duration: integer('duration'),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
