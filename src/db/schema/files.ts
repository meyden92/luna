import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { user } from './auth';
import type { JsonValue } from './json';

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
    scrubReport: jsonb('scrub_report').$type<JsonValue>(),
    moderationStatus: varchar('moderation_status', { length: 32 }).default('clear').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Prisma applied @updatedAt at query level, not in the database — the
    // data-access layer owns this now (issue #23).
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // No ON DELETE clause on the dump's FK -> MySQL default RESTRICT.
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    folderId: text('folder_id').references(() => folder.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
  },
  (t) => [
    index('file_ownerId_idx').on(t.ownerId),
    index('file_folderId_idx').on(t.folderId),
    index('file_sha256_idx').on(t.sha256),
    index('file_md5_idx').on(t.md5),
    index('file_phash_idx').on(t.phash),
    index('file_moderationStatus_idx').on(t.moderationStatus),
    index('file_ownerId_isDeleted_createdAt_id_idx').on(t.ownerId, t.isDeleted, t.createdAt, t.id),
    index('file_ownerId_isDeleted_folderId_createdAt_id_idx').on(t.ownerId, t.isDeleted, t.folderId, t.createdAt, t.id),
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
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  },
  (t) => [index('folder_ownerId_idx').on(t.ownerId)],
);

export const fileMetadata = pgTable('file_metadata', {
  id: text('id').primaryKey(),
  fileId: text('file_id')
    .notNull()
    .unique('file_metadata_fileId_key')
    .references(() => file.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
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

export const fileRendition = pgTable(
  'file_rendition',
  {
    id: text('id').primaryKey(),
    // Dump has no FK constraint on this column despite the naming convention —
    // reproduced faithfully (see module report).
    sourceFileId: text('source_file_id').notNull(),
    paramHash: varchar('param_hash', { length: 64 }).notNull().unique('file_rendition_paramHash_key'),
    params: jsonb('params').$type<JsonValue>().notNull(),
    s3Key: text('s3_key').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    private: boolean('private').default(false).notNull(),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Prisma applied @updatedAt at query level, not in the database.
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('file_rendition_sourceFileId_idx').on(t.sourceFileId), index('file_rendition_lastAccessedAt_idx').on(t.lastAccessedAt)],
);

export const ocrResult = pgTable(
  'ocr_result',
  {
    id: text('id').primaryKey(),
    fileId: text('file_id')
      .notNull()
      .references(() => file.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    fileHash: text('file_hash').notNull(),
    text: text('text').notNull(),
    words: jsonb('words').$type<JsonValue>().notNull(),
    lines: jsonb('lines').$type<JsonValue>().notNull(),
    confidence: doublePrecision('confidence').notNull(),
    statistics: jsonb('statistics').$type<JsonValue>().notNull(),
    imageWidth: integer('image_width').notNull(),
    imageHeight: integer('image_height').notNull(),
    language: text('language').default('eng+deu').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Prisma applied @updatedAt at query level, not in the database.
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('ocr_result_fileId_idx').on(t.fileId), index('ocr_result_fileHash_idx').on(t.fileHash)],
);

export const snippet = pgTable(
  'snippet',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    content: text('content').notNull(),
    language: text('language'),
    isPublic: boolean('is_public').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    isDeleted: boolean('is_deleted').default(false).notNull(),
  },
  (t) => [index('snippet_ownerId_idx').on(t.ownerId)],
);
