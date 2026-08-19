import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Reference-slice subset of `user` (issue #17) — not the full column list.
 *
 * Note the naming is MIXED in production: everything is camelCase except
 * `storage_quota_mib`, which was added later with a Prisma @map. Any assumption
 * that one convention holds across the schema is wrong.
 *
 * `user` is a Postgres reserved word (issue #23). Drizzle quotes it
 * automatically; hand-written SQL must.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').default(false).notNull(),
  image: text('image'),
  banned: boolean('banned'),
  role: text('role'),
  isSuperAdmin: boolean('isSuperAdmin').default(false).notNull(),
  isDeleted: boolean('isDeleted').default(false).notNull(),
  deletedAt: timestamp('deletedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
  storageQuotaMiB: integer('storage_quota_mib').default(2048).notNull(),
});
