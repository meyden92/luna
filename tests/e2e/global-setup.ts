import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalAccountIssuer } from '@better-auth/core/db';
import { hashPassword } from 'better-auth/crypto';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { account, session, user } from '../../src/db/schema';
import {
  disconnectTestDb,
  getTestDb,
  SESSION_COOKIE_NAME,
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_USERNAME,
  TEST_EMAIL_DOMAIN,
  TEST_PASSWORD,
  TEST_USER_EMAIL,
  TEST_USER_USERNAME,
} from './utils/db';
import { signSessionCookie } from './utils/sign-cookie';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
const AUTH_DIR = resolve(HERE, '.auth');

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type StoredSession = { storagePath: string; cookieValue: string };

async function ensureUser(email: string, name: string, username: string, isSuperAdmin: boolean): Promise<string> {
  const db = getTestDb();
  const id = `e2e-${email.split('@')[0]}`;
  // Emails are stored lower-cased (issue #23) — seed through the same rule the
  // application uses, or the fixture user is invisible to a normalised lookup.
  const normalisedEmail = email.toLowerCase();
  const [row] = await db
    .insert(user)
    .values({ id, email: normalisedEmail, name, username, displayUsername: username, emailVerified: true, active: true, isSuperAdmin })
    .onConflictDoUpdate({
      target: user.email,
      set: {
        name,
        username,
        displayUsername: username,
        isSuperAdmin,
        active: true,
        banned: false,
        isDeleted: false,
        updatedAt: new Date(),
      },
    })
    .returning({ id: user.id });

  const userId = row?.id ?? id;
  await ensureCredentialAccount(userId);
  return userId;
}

/**
 * Gives the fixture a password Account. The hash comes from Better-Auth's own
 * primitive, so it cannot drift from what the application verifies against.
 */
async function ensureCredentialAccount(userId: string): Promise<void> {
  const db = getTestDb();
  const password = await hashPassword(TEST_PASSWORD);

  await db.delete(account).where(eq(account.userId, userId));
  await db.insert(account).values({
    id: `e2e-credential-${userId}`,
    userId,
    accountId: userId,
    providerId: 'credential',
    issuer: createLocalAccountIssuer('credential'),
    password,
  });
}

async function createSessionForUser(userId: string, baseURL: URL): Promise<StoredSession> {
  const db = getTestDb();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is not set — cannot mint Playwright session cookies.');
  }

  const token = randomBytes(32).toString('hex');
  const sessionId = `e2e-session-${randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.delete(session).where(eq(session.userId, userId));
  await db.insert(session).values({
    id: sessionId,
    userId,
    token,
    expiresAt,
    ipAddress: '127.0.0.1',
    userAgent: 'playwright-e2e',
  });

  const cookieValue = signSessionCookie(token, secret);

  const storage = {
    cookies: [
      {
        name: SESSION_COOKIE_NAME,
        value: cookieValue,
        domain: baseURL.hostname,
        path: '/',
        expires: Math.floor(expiresAt.getTime() / 1000),
        httpOnly: true,
        secure: baseURL.protocol === 'https:',
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  };

  const storagePath = resolve(AUTH_DIR, `${userId}.json`);
  await writeFile(storagePath, JSON.stringify(storage, null, 2));
  return { storagePath, cookieValue };
}

export default async function globalSetup(): Promise<void> {
  loadEnv({ path: resolve(PROJECT_ROOT, '.env') });
  loadEnv({ path: resolve(PROJECT_ROOT, '.env.local'), override: true });

  await mkdir(AUTH_DIR, { recursive: true });

  const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000');

  const userId = await ensureUser(TEST_USER_EMAIL, 'E2E User', TEST_USER_USERNAME, false);
  const adminId = await ensureUser(TEST_ADMIN_EMAIL, 'E2E Admin', TEST_ADMIN_USERNAME, true);

  const userSession = await createSessionForUser(userId, baseURL);
  const adminSession = await createSessionForUser(adminId, baseURL);

  process.env.E2E_USER_STORAGE = userSession.storagePath;
  process.env.E2E_ADMIN_STORAGE = adminSession.storagePath;
  process.env.E2E_TEST_EMAIL_DOMAIN = TEST_EMAIL_DOMAIN;

  await disconnectTestDb();
}
