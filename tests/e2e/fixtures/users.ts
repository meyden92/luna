import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';

/** The fixed users of the suite. #105 adds gallery, worker, quota and empty. */
export type Role = 'admin';

/** Where the setup project saves a role's signed-in session. Gitignored. */
export function storageStatePath(role: Role): string {
  return resolve(import.meta.dirname, '../.auth', `${role}.json`);
}

/**
 * A `cf-connecting-ip` no other context uses. Production keys Better-Auth's
 * sign-in rate limiter on this header (#100), so every browser and request
 * context gets its own address unless a spec reuses one on purpose.
 */
export function clientIpHeader(): { 'cf-connecting-ip': string } {
  return { 'cf-connecting-ip': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` };
}
