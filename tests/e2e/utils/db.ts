import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export const TEST_EMAIL_DOMAIN = 'lunashare.test';
export const TEST_USER_EMAIL = `e2e-user@${TEST_EMAIL_DOMAIN}`;
export const TEST_ADMIN_EMAIL = `e2e-admin@${TEST_EMAIL_DOMAIN}`;
export const SESSION_COOKIE_NAME = 'lunashare.session_token';

/**
 * Seeding handle for the Playwright suite.
 *
 * Deliberately its own pool rather than `src/db/client`: the app handle carries
 * the relations and is validated by `@/libs/env`, neither of which a fixture
 * script needs, and importing it would drag the whole env schema into the
 * Playwright process.
 *
 * It still writes through the Drizzle table definitions, so a seeded row cannot
 * drift from the shape the application reads. No `relations` are passed: the
 * fixtures only need core inserts and deletes.
 */
let pool: Pool | undefined;
let client: ReturnType<typeof drizzle> | undefined;

export function getTestDb() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set — Playwright tests need it to seed users.');
  }
  pool = new Pool({ connectionString: url });
  client = drizzle({ client: pool });
  return client;
}

export async function disconnectTestDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  client = undefined;
}
