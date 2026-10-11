import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

/**
 * Drizzle on the stack's Postgres, for the `db` fixture: reads, plus
 * backdating `file.created_at`, and seeding form shares (`utils/form-shares.ts`,
 * which no screen can create); nothing else.
 *
 * Deliberately its own pool rather than `src/db/client`: the app handle is
 * validated by `@/libs/env`, which would drag the whole app environment into
 * the Playwright process. Specs still query through the app's table
 * definitions (`src/db/schema`), so they cannot drift from the schema.
 */
export function createTestDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return { db: drizzle({ client: pool }), close: () => pool.end() };
}

export type TestDb = ReturnType<typeof createTestDb>['db'];
