/**
 * Post-transform data verification (issues #32, #24).
 *
 * Three checks, because each catches a class the others miss:
 *   - row counts prove nothing was dropped;
 *   - foreign key integrity proves nothing was orphaned;
 *   - column names prove the rows landed in the right columns. Row counts alone
 *     would have passed a schema wrong in every name, which is the trap #31
 *     describes and the reason this check exists at all.
 *
 * Plus collation spot checks, the one class of error no count or constraint
 * catches: on Postgres `text` a case-mismatched value silently stops matching.
 *
 *   bun run db:verify-data
 */
import 'dotenv/config';
import mariadb from 'mariadb';
import { Client } from 'pg';
import { loadSource, SOURCE_DDL_PATH, toSnakeCase } from './column-map';
import { EXCLUDED_FROM_TRANSFER, LOWERCASED } from './transform-tables';

type Problem = { check: string; detail: string };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const { tables } = await loadSource(SOURCE_DDL_PATH);
  const source = await mariadb.createConnection({
    host: process.env.REHEARSAL_MARIADB_HOST ?? '127.0.0.1',
    port: Number(process.env.REHEARSAL_MARIADB_PORT ?? 3307),
    user: process.env.REHEARSAL_MARIADB_USER ?? 'root',
    password: process.env.REHEARSAL_MARIADB_PASSWORD ?? 'lunashare',
    database: process.env.REHEARSAL_MARIADB_DATABASE ?? 'lunashare',
    timezone: 'Z',
    bigIntAsNumber: true,
  });
  const target = new Client({ connectionString: url });
  await target.connect();

  const problems: Problem[] = [];
  let migratedRows = 0;
  let migratedTables = 0;

  for (const table of tables) {
    const [{ n: sourceCount }] = await source.query(`SELECT COUNT(*) AS n FROM \`${table.name}\``);
    const targetResult = await target.query<{ n: string }>(`SELECT COUNT(*) AS n FROM "${table.name}"`);
    const targetCount = Number(targetResult.rows[0]?.n ?? 0);
    const excluded = table.name in EXCLUDED_FROM_TRANSFER;

    if (excluded) {
      // An excluded table must arrive empty. A non-empty one means the drop list
      // and the transform have drifted apart.
      if (targetCount !== 0) {
        problems.push({ check: 'excluded table', detail: `${table.name} holds ${targetCount} rows but is on the drop list` });
      }
      continue;
    }

    migratedTables++;
    migratedRows += targetCount;
    if (Number(sourceCount) !== targetCount) {
      problems.push({ check: 'row count', detail: `${table.name}: source ${sourceCount}, target ${targetCount}` });
    }

    // Column names, per table, through the mapping.
    const applied = await target.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table.name],
    );
    const appliedNames = new Set(applied.rows.map((r) => r.column_name));
    for (const column of table.columns) {
      const expected = toSnakeCase(column.name);
      if (!appliedNames.has(expected)) {
        problems.push({ check: 'column name', detail: `${table.name}.${column.name} -> expected ${expected}, absent` });
      }
    }
  }

  // Foreign key integrity. Postgres enforced this on insert, but an explicit
  // check is what makes the rehearsal report say so rather than imply it.
  for (const table of tables) {
    if (table.name in EXCLUDED_FROM_TRANSFER) continue;
    for (const fk of table.foreignKeys) {
      if (fk.targetTable in EXCLUDED_FROM_TRANSFER) continue;
      const child = toSnakeCase(fk.column);
      const parent = toSnakeCase(fk.targetColumn);
      const orphans = await target.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM "${table.name}" c
          WHERE c."${child}" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "${fk.targetTable}" p WHERE p."${parent}" = c."${child}")`,
      );
      const n = Number(orphans.rows[0]?.n ?? 0);
      if (n > 0) {
        problems.push({ check: 'foreign key', detail: `${table.name}.${child} has ${n} rows with no ${fk.targetTable}` });
      }
    }
  }

  // Collation spot checks against real migrated rows, not fixtures — the
  // transform is where a normalisation gap on historical values shows up, and
  // fixtures will not have the awkward ones (#23, #24).
  const collationSites = Object.entries(LOWERCASED).flatMap(([table, columns]) =>
    columns.map((column) => [table, toSnakeCase(column)] as const),
  );
  // Serial, not Promise.all: a single pg Client cannot have two queries in
  // flight, and overlapping them only earns a deprecation warning.
  const mixedCase: { table: string; column: string; n: number }[] = [];
  for (const [table, column] of collationSites) {
    const result = await target.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" <> lower("${column}")`,
    );
    mixedCase.push({ table, column, n: Number(result.rows[0]?.n ?? 0) });
  }
  for (const { table, column, n } of mixedCase) {
    if (n > 0) {
      problems.push({
        check: 'collation',
        detail: `${table}.${column} still holds ${n} value(s) that are not lower-cased — the denylist gate fails OPEN on these (#42)`,
      });
    }
  }

  await source.end();
  await target.end();

  console.log(`verified ${migratedTables} migrated tables, ${migratedRows} rows`);
  console.log('  row counts       source == target');
  console.log('  foreign keys     every reference resolves');
  console.log('  column names     every source column present under its snake_case name');
  console.log('  collation        every normalised column holds only lower-cased values');

  if (problems.length === 0) {
    console.log('\nrehearsal verified clean.');
    return;
  }
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  [${p.check}] ${p.detail}`);
  process.exitCode = 1;
}

await main();
