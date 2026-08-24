import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

/**
 * Better-Auth's five core tables (issue #17): `user`, `session`, `account`,
 * `verification`, `token`. All of their FKs point at `user`, so this module
 * owns all five and needs no cross-module imports.
 *
 * Production naming is MIXED — everything camelCase except `storage_quota_mib`,
 * added later with a Prisma @map. Issue #28 normalises all physical columns to
 * snake_case, so `storage_quota_mib` is the one that needs no change.
 *
 * `user` is a Postgres reserved word (issue #23). Drizzle quotes it
 * automatically; hand-written SQL must.
 */
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    // `username` is the lower-cased form sign-in matches on; `displayUsername`
    // keeps the casing the User typed. Nullable: a User has neither until
    // credentials are set for them.
    username: text('username').unique(),
    displayUsername: text('display_username'),
    active: boolean('active').default(true).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Prisma applied @updatedAt at query level, not in the database — the
    // data-access layer owns this now (issue #23).
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    bio: varchar('bio', { length: 150 }),
    description: text('description'),
    isProfilePublic: boolean('is_profile_public').default(true).notNull(),
    receiveEmail: boolean('receive_email').default(true).notNull(),
    banExpires: timestamp('ban_expires', { withTimezone: true }),
    banReason: text('ban_reason'),
    banned: boolean('banned'),
    emailVerified: boolean('email_verified').default(false).notNull(),
    name: text('name').default('Mysterious User').notNull(),
    role: text('role'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    showAllFilesIncludesFoldered: boolean('show_all_files_includes_foldered').default(true).notNull(),
    isSuperAdmin: boolean('is_super_admin').default(false).notNull(),
    // Already snake_case in production (added later via a Prisma @map) — do not double-convert.
    storageQuotaMiB: integer('storage_quota_mib').default(2048).notNull(),
  },
  // Redundant with the primary key, but the source dump declares it explicitly.
  (t) => [index('user_id_idx').on(t.id)],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
  },
  // Source dump has two separately named indexes on userId (the FK's own index
  // plus an explicit one) — both reproduced verbatim.
  (t) => [
    index('session_userId_fkey').on(t.userId),
    index('session_userId_idx').on(t.userId),
    index('session_expiresAt_idx').on(t.expiresAt),
  ],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    // Better-Auth ≥1.7 keys accounts by (issuer, accountId). Providers without
    // an issuer of their own get a synthetic one, e.g. 'local:credential'.
    issuer: text('issuer').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('account_userId_fkey').on(t.userId),
    index('account_userId_idx').on(t.userId),
    uniqueIndex('account_issuer_accountId_key').on(t.issuer, t.accountId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // Source index was a prefix-length key (identifier(191)); Postgres has no
  // prefix-length index syntax, so it becomes a full-column index (issue #23).
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

export const token = pgTable(
  'token',
  {
    id: text('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    key: varchar('key', { length: 64 }).notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    enabled: boolean('enabled').default(true).notNull(),
    compressImage: boolean('compress_image').default(false).notNull(),
    convertToJpeg: boolean('convert_to_jpeg').default(false).notNull(),
    jpegQuality: integer('jpeg_quality').default(85).notNull(),
    // No FK constraint in the source dump for folderId/flowId (folder/flow
    // live in other modules) — kept as plain, unenforced references.
    folderId: text('folder_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    stripMetadata: boolean('strip_metadata').default(false).notNull(),
    flowId: text('flow_id'),
  },
  // folderId has no index in the source dump, unlike flowId — reproduced as-is.
  (t) => [index('token_key_idx').on(t.key), index('token_userId_idx').on(t.userId), index('token_flowId_idx').on(t.flowId)],
);
