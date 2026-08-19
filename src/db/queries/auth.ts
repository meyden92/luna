import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { and, count, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import * as schema from '../schema';
import { templateGeneration } from '../schema/ai';
import { token, user } from '../schema/auth';
import { file } from '../schema/files';

/**
 * Query module for authentication, user profiles and API tokens (issue #36).
 * Same contract as the files module: call sites import named functions, the
 * `db` handle stays inside `src/db/`, and audited writes happen inside the
 * write function.
 *
 * `User` and `Token` are audited; `Session`, `Account` and `Verification` are
 * not (issue #13) — session churn is not a deliberate act. Better-Auth writes
 * all five through its own adapter, which never passes through `writeAuditLog`,
 * so a login cannot produce audit noise. That was already true under Prisma:
 * the adapter was handed `prismabase`, the client without the audit extension.
 *
 * The one write that adapter makes which IS deliberate action is registration,
 * so `auditUserCreated` below is called from the `user.create.after` database
 * hook. Everything else Better-Auth writes stays unaudited by design.
 */

/**
 * Emails are lower-cased on read and on write. MariaDB's utf8mb4_unicode_ci
 * matched case-insensitively; Postgres `text` does not, so `Alice@x.com` and
 * `alice@x.com` become two accounts with no error (issue #23). `user.email` is
 * in the transform's LOWERCASED set and all four migrated rows are already
 * lower-case, so this is a no-op on history and a guarantee going forward.
 *
 * Better-Auth normalises on both sides itself at 1.6.26 — `@better-auth/core`'s
 * user schema transforms `email` to lower case on write, and every internal
 * lookup (`findUserByEmail`, `findOAuthUser`, `updateUserByEmail`) calls
 * `email.toLowerCase()` before hitting the adapter. This export exists so any
 * application-side email comparison has the same one reviewable place, rather
 * than depending on that library behaviour by accident.
 */
export function normaliseEmail(email: string): string {
  return email.toLowerCase();
}

/**
 * API token keys are lower-cased on read and on write, for the same reason.
 * Tightening this lookup would silently break existing tokens, so it was
 * checked first: `token.key` is in the transform's LOWERCASED set and both
 * production keys are 64-char lower-case hex, so normalisation matches every
 * historical value. `generateToken()` produces lower-case hex too, so the write
 * path was already canonical — normalising it is belt and braces, not a change.
 */
export function normaliseTokenKey(key: string): string {
  return key.toLowerCase();
}

/**
 * Better-Auth's database adapter, built here so the `db` handle never leaves
 * `src/db/` (issue #15).
 *
 * `provider: 'pg'` and the schema barrel are the whole configuration. The
 * adapter resolves fields against Drizzle's TypeScript property names, never
 * the physical column, so the snake_case rename in #28 is invisible to it and
 * no `modelName`/`fields` overrides are needed.
 *
 * `transaction: true` because Postgres has transactions. The option defaults to
 * off for cross-database portability (transaction-incapable backends), which is
 * not a constraint here.
 *
 * `experimental.joins` is deliberately left off: the adapter's join path calls
 * `db.query.x.findFirst({ where: clause })` with a raw SQL clause, which the
 * Drizzle 1.0 relational `where` DSL does not accept. With joins off the adapter
 * only ever issues core selects, which is the path this schema supports.
 */
export function authDatabaseAdapter() {
  return drizzleAdapter(db, { provider: 'pg', schema, transaction: true });
}

/** The dashboard's per-user display preference. */
export async function getUserPreferences(userId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({ showAllFilesIncludesFoldered: user.showAllFilesIncludesFoldered })
    .from(user)
    .where(eq(user.id, userId));
  return row;
}

/** The user fields the settings page renders. */
export async function getSettingsProfile(userId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      receiveEmail: user.receiveEmail,
      isProfilePublic: user.isProfilePublic,
      bio: user.bio,
      description: user.description,
      showAllFilesIncludesFoldered: user.showAllFilesIncludesFoldered,
    })
    .from(user)
    .where(eq(user.id, userId));
  return row;
}

/**
 * An omitted field is left alone, matching what the profile form submits and
 * what Prisma did with `undefined`. Drizzle drops undefined values from `set()`
 * for the same reason, so the two behave identically.
 */
export type ProfileUpdate = {
  receiveEmail?: boolean;
  isProfilePublic?: boolean;
  bio?: string | null;
  description?: string | null;
  showAllFilesIncludesFoldered?: boolean;
};

/**
 * Updates the user's own profile. Audited: `User` is in the audited set because
 * role, ban status and quota changes are exactly what the trail is for, and the
 * same model carries these self-service edits.
 */
export async function updateUserProfile(userId: string, values: ProfileUpdate, actorId: string | null, handle: AuditHandle = db) {
  const [before] = await handle.select().from(user).where(eq(user.id, userId));
  if (!before) throw new Error('User not found');

  const [after] = await handle
    .update(user)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning();
  if (!after) throw new Error('User not found');

  await writeAuditLog(handle, { model: 'User', action: 'update', before, after, userId: actorId });
  return after;
}

/**
 * A public profile with its live file count.
 *
 * A relation count is one of the shapes the relational query API cannot express,
 * so it is a core select with an explicit join and GROUP BY (issue #21).
 * `count(file.id)` ignores the nulls the LEFT JOIN produces, so a user with no
 * files correctly reports zero.
 */
export async function getPublicProfile(id: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select({
      id: user.id,
      name: user.name,
      image: user.image,
      bio: user.bio,
      description: user.description,
      role: user.role,
      isProfilePublic: user.isProfilePublic,
      fileCount: count(file.id),
    })
    .from(user)
    .leftJoin(file, and(eq(file.ownerId, user.id), eq(file.isDeleted, false)))
    .where(eq(user.id, id))
    .groupBy(user.id);
  return row;
}

/**
 * The owner's live uploads in a window, with the two columns the settings
 * charts read.
 *
 * `listOwnedFilesInRange` in the files module returns `id` and `title` only;
 * the upload-per-day chart needs `createdAt`. Adding a projection to another
 * batch's module is off limits, so the narrow variant lives here (issue #36).
 */
export function listOwnedUploadsInRange({ ownerId, from, to }: { ownerId: string; from: Date; to: Date }, handle: AuditHandle = db) {
  return handle
    .select({ createdAt: file.createdAt, title: file.title })
    .from(file)
    .where(and(eq(file.ownerId, ownerId), eq(file.isDeleted, false), gte(file.createdAt, from), lte(file.createdAt, to)));
}

/** Generation counts per status — grouping, so a core select (issue #21). */
export function countTemplateGenerationsByStatus(userId: string, handle: AuditHandle = db) {
  return handle
    .select({ status: templateGeneration.status, total: count() })
    .from(templateGeneration)
    .where(eq(templateGeneration.userId, userId))
    .groupBy(templateGeneration.status);
}

/** Every API token the user owns, newest first. */
export function listUserTokens(userId: string, handle: AuditHandle = db) {
  return handle.select().from(token).where(eq(token.userId, userId)).orderBy(desc(token.createdAt));
}

/**
 * One token by id, with the fields the ShareX config builder checks. The caller
 * asserts ownership, matching the behaviour it replaces: "not found", "not
 * enabled" and "unauthorised" stay three distinct errors.
 */
export async function getTokenById(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select({ key: token.key, enabled: token.enabled, userId: token.userId }).from(token).where(eq(token.id, id));
  return row;
}

/**
 * Creates an API token. Audited — issuing a credential is a deliberate act —
 * but `audit.ts` redacts `Token.key` from both snapshots (issue #27), so the
 * secret never reaches an audit row.
 */
export async function createUserToken(
  { name, key, userId }: { name: string; key: string; userId: string },
  actorId: string | null,
  handle: AuditHandle = db,
) {
  const [row] = await handle
    .insert(token)
    .values({ id: crypto.randomUUID(), name, key: normaliseTokenKey(key), userId })
    .returning();
  if (!row) throw new Error('Failed to create token');

  await writeAuditLog(handle, { model: 'Token', action: 'create', after: row, userId: actorId });
  return row;
}

/** Deletes a token the user owns. Returns undefined when they do not own it. */
export async function deleteOwnedToken({ id, userId }: { id: string; userId: string }, actorId: string | null, handle: AuditHandle = db) {
  const [before] = await handle
    .delete(token)
    .where(and(eq(token.id, id), eq(token.userId, userId)))
    .returning();
  if (!before) return undefined;

  await writeAuditLog(handle, { model: 'Token', action: 'delete', before, userId: actorId });
  return before;
}

export type TokenSettings = {
  compressImage: boolean;
  convertToJpeg: boolean;
  jpegQuality: number;
  folderId: string | null;
  stripMetadata: boolean;
  flowId: string | null;
};

/** Updates the upload behaviour attached to a token the user owns. */
export async function updateOwnedTokenSettings(
  { id, userId, settings }: { id: string; userId: string; settings: TokenSettings },
  actorId: string | null,
  handle: AuditHandle = db,
) {
  const [before] = await handle
    .select()
    .from(token)
    .where(and(eq(token.id, id), eq(token.userId, userId)));
  if (!before) return undefined;

  const [after] = await handle
    .update(token)
    .set({ ...settings, updatedAt: new Date() })
    .where(eq(token.id, before.id))
    .returning();
  if (!after) return undefined;

  await writeAuditLog(handle, { model: 'Token', action: 'update', before, after, userId: actorId });
  return after;
}

export type ValidatedToken = typeof token.$inferSelect & { user: typeof user.$inferSelect };

/**
 * Resolves a raw API token key to its enabled token and owning user — the check
 * every token-authenticated request runs.
 *
 * A core select with an inner join rather than the relational API: the filter
 * reaches into the joined `user` row (not deleted, not currently banned), which
 * the relational `where` DSL cannot express. `banExpires <= now` readmits a user
 * whose ban has lapsed, matching the Prisma predicate it replaces.
 *
 * The key is normalised here, on the read side, to pair with the normalisation
 * on the write side in `createUserToken` — normalising one side only is a
 * silent half-fix (issue #23).
 */
export async function validateTokenKey(key: string, handle: AuditHandle = db): Promise<ValidatedToken | undefined> {
  const [row] = await handle
    .select()
    .from(token)
    .innerJoin(user, eq(user.id, token.userId))
    .where(
      and(
        eq(token.key, normaliseTokenKey(key)),
        eq(token.enabled, true),
        eq(user.isDeleted, false),
        or(isNull(user.banned), eq(user.banned, false), lte(user.banExpires, new Date())),
      ),
    );
  return row ? { ...row.token, user: row.user } : undefined;
}

/**
 * Audits a user created by Better-Auth (issues #36, #13).
 *
 * Better-Auth's adapter writes through Drizzle directly and never reaches a
 * query module, so registration would otherwise be the one `User` write with no
 * audit row — and creating an account is deliberate action, which is exactly
 * what #13 says to record. Called from the `user.create.after` database hook so
 * the trail does not depend on remembering it at a call site.
 *
 * `userId` is the new user themselves: registration is self-service, and there
 * is no acting admin to attribute it to.
 */
export async function auditUserCreated(created: { id: string } & Record<string, unknown>): Promise<void> {
  await writeAuditLog(db, { model: 'User', action: 'create', after: created, userId: created.id });
}
