import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '@/libs/env';
import { relations } from './relations';

/**
 * Lazy singleton connection, replacing the `globalThis.__prisma` proxy
 * (issue #25). No pooler sits in front of Postgres, so prepared statements
 * are unconstrained.
 *
 * This handle stays internal to `src/db/` — call sites import query functions
 * from `src/db/queries/*`, never `db` itself (issue #15). That boundary is what
 * makes "no Prisma imports remain" provable rather than assumed.
 */
let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: env.DATABASE_URL });
  return pool;
}

// Drizzle 1.0 takes a single config object with `client` — the v1
// `drizzle(pool, config)` overload no longer exists for node-postgres.
export const db = drizzle({ client: getPool(), relations });
export type Db = typeof db;

/**
 * The handle a `db.transaction()` callback receives. Query modules take
 * `Db | Tx` so a write composes into a caller's transaction without the query
 * module knowing whether one is open.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
