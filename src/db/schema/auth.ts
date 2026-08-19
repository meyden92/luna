import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Reference-slice subset of `user` (issue #17) — not the full column list.
 *
 * Production naming is MIXED — everything camelCase except `storage_quota_mib`,
 * added later with a Prisma @map. Issue #28 normalises all physical columns to
 * snake_case, so `storage_quota_mib` is the one that needs no change.
 *
 * `user` is a Postgres reserved word (issue #23). Drizzle quotes it
 * automatically; hand-written SQL must.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  banned: boolean('banned'),
  role: text('role'),
  isSuperAdmin: boolean('is_super_admin').default(false).notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  storageQuotaMiB: integer('storage_quota_mib').default(2048).notNull(),
});
