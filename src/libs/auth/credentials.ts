import { UserFacingError } from '../user-facing-error';
import { auth } from './auth';

/**
 * Writing credential Accounts. Callers must be authorised before they get here:
 * nothing below checks who is asking.
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
 * Account they had. Omit `actorId` where there is no request behind the call;
 * the audit entry then records no actor rather than guessing at one.
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

    // A password reset answers either onboarding or a compromise, and both want
    // every existing session gone.
    await ctx.internalAdapter.deleteUserSessions(userId);

    await auditCredentialChange(userId, existing?.updatedAt ?? null, actorId);
  }
}

/**
 * Creates a User with a Username and password. Goes through the internal
 * adapter so the `user.create` hooks fire, which is what assigns the default
 * RBAC group and audits the creation.
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
