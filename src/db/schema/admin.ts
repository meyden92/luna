import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { user } from './auth';
import type { JsonValue } from './json';

/**
 * Admin, audit, and moderation domain (issue #30).
 *
 * Covers the audit trail (`audit_log`), the RBAC group model (`rbac_group`,
 * `user_group_assignment`), the image proxy cache (`cached_image`), and the
 * upload moderation pipeline (`denylist_entry`, `moderation_case`).
 *
 * Physical column names are snake_case; TypeScript properties stay camelCase
 * (issue #28), following the same transform as the reference slice.
 */

/**
 * Production's audit trail history is deliberately NOT migrated (issue #24) —
 * this table starts empty and only accumulates rows written after cutover.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    model: text('model').notNull(),
    action: text('action').notNull(),
    recordId: text('record_id').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    before: jsonb('before').$type<JsonValue>(),
    after: jsonb('after').$type<JsonValue>(),
    changeSet: text('change_set'),
    fieldChanges: jsonb('field_changes').$type<JsonValue>(),
    metadata: jsonb('metadata').$type<JsonValue>(),
    summary: text('summary'),
  },
  (t) => [
    index('audit_log_model_recordId_idx').on(t.model, t.recordId),
    index('audit_log_userId_fkey').on(t.userId),
    index('audit_log_changeSet_idx').on(t.changeSet),
    index('audit_log_timestamp_idx').on(t.timestamp),
  ],
);

export const rbacGroup = pgTable(
  'rbac_group',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Prisma applied @updatedAt at query level, not in the database — the
    // data-access layer owns this now (issue #23).
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // `key` also carries a plain (non-unique) index in the source alongside the
  // unique constraint — redundant, but reproduced verbatim per issue #31.
  (t) => [index('rbac_group_key_idx').on(t.key)],
);

export const userGroupAssignment = pgTable(
  'user_group_assignment',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => rbacGroup.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('user_group_assignment_userId_groupId_key').on(t.userId, t.groupId),
    index('user_group_assignment_userId_idx').on(t.userId),
    index('user_group_assignment_groupId_idx').on(t.groupId),
    index('user_group_assignment_createdByUserId_idx').on(t.createdByUserId),
  ],
);

export const cachedImage = pgTable(
  'cached_image',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    hash: text('hash').notNull(),
    purpose: text('purpose').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('cached_image_ownerId_hash_key').on(t.ownerId, t.hash),
    index('cached_image_ownerId_idx').on(t.ownerId),
    index('cached_image_purpose_idx').on(t.purpose),
    index('cached_image_lastAccessedAt_idx').on(t.lastAccessedAt),
    index('cached_image_url_idx').on(t.url),
  ],
);

export const denylistEntry = pgTable(
  'denylist_entry',
  {
    id: text('id').primaryKey(),
    hashType: varchar('hash_type', { length: 16 }).notNull(),
    // Compared for exact equality against uploaded content hashes. On
    // MariaDB's utf8mb4_unicode_ci that comparison was case-insensitive; on
    // Postgres `text`/`varchar` it is not, so a case-mismatched entry would
    // silently stop blocking content — the gate FAILS OPEN (issue #23). The
    // remedy is normalising hex case on write and read; that lives in the
    // query module, not here.
    hash: varchar('hash', { length: 128 }).notNull(),
    source: varchar('source', { length: 64 }).default('private').notNull(),
    severity: varchar('severity', { length: 32 }).default('block').notNull(),
    notes: text('notes'),
    addedBy: text('added_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('denylist_entry_hashType_hash_key').on(t.hashType, t.hash),
    index('denylist_entry_source_idx').on(t.source),
    index('denylist_entry_addedBy_idx').on(t.addedBy),
  ],
);

export const moderationCase = pgTable(
  'moderation_case',
  {
    id: text('id').primaryKey(),
    fileId: text('file_id').notNull(),
    status: varchar('status', { length: 32 }).default('quarantined').notNull(),
    matchType: varchar('match_type', { length: 32 }).notNull(),
    matchedEntryId: text('matched_entry_id'),
    distance: integer('distance'),
    uploaderId: text('uploader_id'),
    reviewerId: text('reviewer_id'),
    resolution: text('resolution'),
    uploadMetadata: jsonb('upload_metadata').$type<JsonValue>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('moderation_case_fileId_idx').on(t.fileId),
    index('moderation_case_status_createdAt_idx').on(t.status, t.createdAt),
    index('moderation_case_uploaderId_idx').on(t.uploaderId),
    index('moderation_case_reviewerId_idx').on(t.reviewerId),
  ],
);
