import { createHash, randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { user } from '../../../src/db/schema/auth';
import { stackEnv } from '../stack-env';
import type { TestDb } from './db';

/**
 * The fixed users of the suite. The admin is bootstrapped by the wrapper; the
 * rest are created through the admin "Create user" dialog by `users.setup.ts`:
 * - `gallery`: holds the read-only seeded dataset (`gallery.ts`). No spec changes it.
 * - `quota`: has a quota of `QUOTA_USER_QUOTA_MIB`, so a few corpus files exceed it.
 * - `empty`: has nothing, for empty states.
 * - `worker<N>`: one per Playwright worker, for specs that change data.
 */
export type Role = 'admin' | 'gallery' | 'quota' | 'empty' | `worker${number}`;
export type FixtureRole = Exclude<Role, 'admin'>;

export interface FixtureUser {
  role: FixtureRole;
  username: string;
  /** Display name. */
  name: string;
  email: string;
  password: string;
}

/** The quota user's storage quota, set on the admin user detail screen. */
export const QUOTA_USER_QUOTA_MIB = 4;

/** Where the setup project saves a role's signed-in session. Gitignored. */
export function storageStatePath(role: Role): string {
  return resolve(import.meta.dirname, '../.auth', `${role}.json`);
}

/**
 * The worker user for the current worker. Pass `testInfo.parallelIndex`, which
 * stays in `0..workers-1`; `workerIndex` grows each time a worker restarts after
 * a failure, so it would point at a user that does not exist.
 */
export function workerRole(parallelIndex: number): FixtureRole {
  return `worker${parallelIndex}`;
}

/**
 * Credentials of a fixture user. The password is derived from the run's random
 * admin password, so it changes every run yet every process (setup, specs)
 * computes the same value without a shared file.
 */
export function fixtureUser(role: FixtureRole): FixtureUser {
  const username = `e2e-${role}`;
  const password = createHash('sha256').update(`${stackEnv().E2E_ADMIN_PASSWORD}:${username}`).digest('base64url').slice(0, 24);
  const name = role.startsWith('worker') ? `Worker ${role.slice('worker'.length)}` : `${role[0]!.toUpperCase()}${role.slice(1)} User`;
  return { role, username, name, email: `${username}@lunashare.test`, password };
}

/** Every fixture user for a run with `workers` Playwright workers. */
export function fixtureUsers(workers: number): FixtureUser[] {
  const roles: FixtureRole[] = ['gallery', 'quota', 'empty', ...Array.from({ length: workers }, (_, i) => workerRole(i))];
  return roles.map(fixtureUser);
}

/**
 * A `cf-connecting-ip` no other context uses. Production keys Better-Auth's
 * sign-in rate limiter on this header (#100), so every browser and request
 * context gets its own address unless a spec reuses one on purpose.
 */
export function clientIpHeader(): { 'cf-connecting-ip': string } {
  return { 'cf-connecting-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` };
}

/** The database id of a fixture user, for `owner_id` lookups and `/profile/<id>`. */
export async function fixtureUserId(db: TestDb, role: FixtureRole): Promise<string> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, fixtureUser(role).username));
  if (!row) throw new Error(`No user for ${role}`);
  return row.id;
}
