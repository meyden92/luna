/**
 * MariaDB -> PostgreSQL data transform and rehearsal (issues #32, #24).
 *
 * Reads table by table from the scratch MariaDB and writes through the Drizzle
 * schema, so the decided target types enforce themselves: a value that does not
 * fit fails loudly at insert rather than landing silently in a wrong column.
 * That is also why `pgloader` and friends were rejected — they infer target
 * types, and the type decisions here were made deliberately in #23 and #28.
 *
 *   docker compose -f docker-compose.dev.yml up -d --wait
 *   bun run db:rehearse
 *
 * Idempotent: the target tables are truncated first, so a rehearsal repeats from
 * a known state with no manual cleanup.
 */
import 'dotenv/config';
import { getTableName, is, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgTable } from 'drizzle-orm/pg-core';
import mariadb from 'mariadb';
import { Pool } from 'pg';
import * as schema from '../../src/db/schema';
import { loadSource, SOURCE_DDL_PATH, toSnakeCase } from './column-map';
import type { SourceColumn, SourceTable } from './parse-mysql-ddl';
import { EXCLUDED_FROM_TRANSFER, LOWERCASED } from './transform-tables';

type Row = Record<string, unknown>;

/** Every table in the schema barrel, keyed by its physical name. */
function schemaTables(): Map<string, PgTable> {
  const map = new Map<string, PgTable>();
  for (const value of Object.values(schema)) {
    // The barrel also exports types and relation helpers; keep the tables.
    // `is` is the runtime check — `$inferInsert` exists only in the type system.
    if (is(value, PgTable)) map.set(getTableName(value), value);
  }
  return map;
}

/**
 * Physical column name -> Drizzle TypeScript property name. Insert values are
 * keyed by the property, while the source rows are keyed by the physical name,
 * so the transform needs the bridge between the two halves of issue #28.
 */
function propertyByPhysicalName(table: PgTable): Map<string, string> {
  const map = new Map<string, string>();
  for (const [property, column] of Object.entries(table as unknown as Record<string, { name?: string }>)) {
    if (column && typeof column === 'object' && typeof column.name === 'string') map.set(column.name, property);
  }
  return map;
}

/**
 * Coerces one MariaDB value to what the Postgres column expects. Driven by the
 * parsed source type rather than by guessing from the value, so a null and a
 * zero are treated the same way every time.
 */
function coerce(value: unknown, column: SourceColumn): unknown {
  if (value === null || value === undefined) return null;

  if (column.isJson) {
    // Prisma stored Json as a longtext string. A jsonb column wants the parsed
    // value; handing it the string would store a JSON-encoded string instead.
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        throw new Error(`Invalid JSON in ${column.name}: ${value.slice(0, 80)}`);
      }
    }
    return value;
  }

  switch (column.baseType) {
    case 'tinyint':
      return Boolean(value);
    case 'bigint':
      // mode: 'number' columns want a number; the driver may hand back a BigInt.
      return typeof value === 'bigint' ? Number(value) : value;
    case 'int':
    case 'double':
      return typeof value === 'bigint' ? Number(value) : value;
    default:
      return value;
  }
}

/** Orders tables parent-first so foreign keys resolve as rows are inserted. */
export function topologicalOrder(tables: SourceTable[]): SourceTable[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const ordered: SourceTable[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (table: SourceTable) => {
    const status = state.get(table.name);
    if (status === 'done') return;
    if (status === 'visiting') throw new Error(`Foreign key cycle through \`${table.name}\``);
    state.set(table.name, 'visiting');
    for (const fk of table.foreignKeys) {
      const parent = byName.get(fk.targetTable);
      if (parent && parent !== table) visit(parent);
    }
    state.set(table.name, 'done');
    ordered.push(table);
  };

  for (const table of tables) visit(table);
  return ordered;
}

const CHUNK_SIZE = 500;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const { tables } = await loadSource(SOURCE_DDL_PATH);
  const migrated = topologicalOrder(tables).filter((t) => !(t.name in EXCLUDED_FROM_TRANSFER));
  const drizzleTables = schemaTables();

  const source = await mariadb.createConnection({
    host: process.env.REHEARSAL_MARIADB_HOST ?? '127.0.0.1',
    port: Number(process.env.REHEARSAL_MARIADB_PORT ?? 3307),
    user: process.env.REHEARSAL_MARIADB_USER ?? 'root',
    password: process.env.REHEARSAL_MARIADB_PASSWORD ?? 'lunashare',
    database: process.env.REHEARSAL_MARIADB_DATABASE ?? 'lunashare',
    // Source datetimes are UTC wall-clock. Without pinning this the driver
    // reinterprets them in the local zone and every timestamp silently shifts.
    timezone: 'Z',
    bigIntAsNumber: true,
    dateStrings: false,
  });

  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool });

  console.log(`transforming ${migrated.length} tables (${Object.keys(EXCLUDED_FROM_TRANSFER).length} excluded)\n`);

  // Truncate in reverse dependency order so the rehearsal is repeatable from a
  // known state without manual cleanup.
  const targets = migrated.map((t) => `"${t.name}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${targets} RESTART IDENTITY CASCADE`));

  const counts: { table: string; source: number; target: number }[] = [];

  for (const table of migrated) {
    const target = drizzleTables.get(table.name);
    if (!target) throw new Error(`No Drizzle table declared for \`${table.name}\``);
    const propertyOf = propertyByPhysicalName(target);
    const lowercased = new Set(LOWERCASED[table.name] ?? []);

    const rows: Row[] = await source.query({ sql: `SELECT * FROM \`${table.name}\``, rowsAsArray: false });

    const mapped = rows.map((row) => {
      const out: Row = {};
      for (const column of table.columns) {
        const property = propertyOf.get(toSnakeCase(column.name));
        if (!property) throw new Error(`\`${table.name}\`.${column.name} has no column in the Drizzle schema`);
        let value = coerce(row[column.name], column);
        if (typeof value === 'string' && lowercased.has(column.name)) value = value.toLowerCase();
        out[property] = value;
      }
      return out;
    });

    for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
      await db.insert(target).values(mapped.slice(i, i + CHUNK_SIZE) as never);
    }

    counts.push({ table: table.name, source: rows.length, target: mapped.length });
    const note = lowercased.size > 0 ? `  (case-normalised: ${[...lowercased].join(', ')})` : '';
    console.log(`  ${table.name.padEnd(28)} ${String(rows.length).padStart(6)} rows${note}`);
  }

  await source.end();
  await pool.end();

  const total = counts.reduce((n, c) => n + c.target, 0);
  console.log(`\ntransform complete: ${total} rows across ${counts.length} tables`);
  console.log('excluded, each a recorded decision (#24):');
  for (const [name, reason] of Object.entries(EXCLUDED_FROM_TRANSFER)) console.log(`  - ${name}: ${reason}`);
}

await main();
