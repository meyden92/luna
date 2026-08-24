import { UserFacingError } from '../user-facing-error';
import { auth } from './auth';

/**
 * Writing credential Accounts (issue #54).
 *
 * Better-Auth's admin plugin exposes `/admin/create-user` and
 * `/admin/set-user-password` over HTTP, but those endpoints authorise against
 * its own `user.role` column. LunaShare's authority is RBAC — `isSuperAdmin` or
 * membership of the admin group — so going through the HTTP endpoints would
 * introduce a second, disagreeing definition of "admin". These helpers use
 * Better-Auth's server context instead, and authorisation stays where it
 * already is: the `admin` middleware on the server functions that call them.
 *
 * Password hashing always comes from that same context, so the scheme can never
 * drift from what sign-in verifies against.
 *
 * Every read and every audited write lives in `db/queries/auth` — the Drizzle
 * handle does not leave `src/db/` (issue #15), and an audited write happens
 * inside its write function (issue #13). This module orchestrates; it does not
 * query.
 */

/** A failure the caller can show to a human as-is. */
export class CredentialsError extends UserFacingError {
  constructor(message: string) {
    super(message, 'CredentialsError');
  }
}

/** Better-Auth's provider id for a password Account. */
const CREDENTIAL_PROVIDER = 'credential';

/** Rejects a Username already held by someone else. */
async function assertUsernameFree(normalized: string, exceptUserId?: string) {
  const { findUserIdByUsername } = await import('@/db/queries/auth');
  if (await findUserIdByUsername(normalized, exceptUserId)) {
    throw new CredentialsError('That username is already taken');
  }
}

/**
 * Gives an existing User a Username and password, replacing whatever credential
 * Account they had. Used by the admin password reset and by
 * `scripts/auth/set-credentials.ts`.
 *
 * `actorId` is who is doing it. Omit it for the script, where there is no
 * request and therefore no actor — the audit layer records null rather than
 * guessing.
 */
export async function setUserCredentials({
  userId,
  username,
  password,
  actorId,
}: {
  userId: string;
  username?: string;
  password?: string;
  actorId?: string | null;
}) {
  const { auditCredentialChange, findCredentialAccount } = await import('@/db/queries/auth');
  const ctx = await auth.$context;

  if (username) {
    const normalized = username.toLowerCase();
    await assertUsernameFree(normalized, userId);
    await ctx.internalAdapter.updateUser(userId, { username: normalized, displayUsername: username });
  }

  if (password) {
    const hash = await ctx.password.hash(password);
    const existing = await findCredentialAccount(userId, CREDENTIAL_PROVIDER);

    if (existing) {
      await ctx.internalAdapter.updateAccount(existing.id, { password: hash });
    } else {
      await ctx.internalAdapter.linkAccount({
        userId,
        providerId: CREDENTIAL_PROVIDER,
        accountId: userId,
        password: hash,
      });
    }

    // Anyone holding a session on the old password loses it. An admin resetting
    // a password is either onboarding someone or responding to a compromise,
    // and both want every existing session gone.
    await ctx.internalAdapter.deleteUserSessions(userId);

    await auditCredentialChange(userId, existing?.updatedAt ?? null, actorId);
  }
}

/**
 * Creates a User with a Username and password. Registration is closed, so this
 * is reachable only from the admin panel.
 *
 * Goes through Better-Auth's internal adapter, which runs the `user.create`
 * database hooks — that is what assigns the default RBAC group and writes the
 * creation to the audit log.
 */
export async function createUserWithCredentials({
  username,
  name,
  email,
  password,
}: {
  username: string;
  name: string;
  email: string;
  password: string;
}) {
  const { findUserIdByEmail } = await import('@/db/queries/auth');

  const normalizedEmail = email.toLowerCase();
  const normalizedUsername = username.toLowerCase();

  await assertUsernameFree(normalizedUsername);
  if (await findUserIdByEmail(normalizedEmail)) {
    throw new CredentialsError('A user with that email already exists');
  }

  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser({
    email: normalizedEmail,
    name,
    username: normalizedUsername,
    displayUsername: username,
    emailVerified: false,
  });

  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: CREDENTIAL_PROVIDER,
    accountId: created.id,
    password: await ctx.password.hash(password),
  });

  return { id: created.id, email: created.email, name: created.name, username: normalizedUsername };
}
