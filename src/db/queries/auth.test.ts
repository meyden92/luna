import { afterAll, describe, expect, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';

/**
 * Who the `User` `create` audit entry names as actor (issue #170). Drives the
 * real `createUserWithCredentials`, because the attribution only exists across
 * Better-Auth's `user.create.after` hook. Needs a real Postgres; skips cleanly
 * without `DATABASE_URL`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Lazy, because `../client` opens a connection pool at module load. */
async function loadModules() {
  const [client, adminSchema, authSchema, credentials] = await Promise.all([
    import('../client'),
    import('../schema/admin'),
    import('../schema/auth'),
    import('@/libs/auth/credentials'),
  ]);
  return {
    db: client.db,
    auditLog: adminSchema.auditLog,
    user: authSchema.user,
    createUserWithCredentials: credentials.createUserWithCredentials,
  };
}

type Modules = Awaited<ReturnType<typeof loadModules>>;
const { db, auditLog, user, createUserWithCredentials } = hasDatabase ? await loadModules() : ({} as Modules);

const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const adminId = `audit-actor-admin-${runId}`;
const createdIds: string[] = [];

async function createdEntryActor(userId: string) {
  const [entry] = await db.select({ actor: auditLog.userId }).from(auditLog).where(eq(auditLog.recordId, userId));
  return entry?.actor;
}

afterAll(async () => {
  if (!hasDatabase) return;
  await db.delete(auditLog).where(inArray(auditLog.recordId, createdIds));
  await db.delete(user).where(inArray(user.id, [...createdIds, adminId]));
});

describe.skipIf(!hasDatabase)('User create audit actor', () => {
  test('a user created by an admin is attributed to the admin', async () => {
    await db.insert(user).values({ id: adminId, email: `${adminId}@example.invalid`, name: 'audit actor admin' });
    const created = await createUserWithCredentials({
      username: `actor-${runId}`,
      name: 'Created by admin',
      email: `actor-${runId}@example.invalid`,
      password: 'correct-horse-battery',
      actorId: adminId,
    });
    createdIds.push(created.id);

    expect(await createdEntryActor(created.id)).toBe(adminId);
  });

  test('without an acting admin the new user is their own actor', async () => {
    const created = await createUserWithCredentials({
      username: `self-${runId}`,
      name: 'Created by script',
      email: `self-${runId}@example.invalid`,
      password: 'correct-horse-battery',
    });
    createdIds.push(created.id);

    expect(await createdEntryActor(created.id)).toBe(created.id);
  });
});
