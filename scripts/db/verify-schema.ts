/**
 * Schema verification (issue #31) — diffs the applied PostgreSQL schema against
 * the MariaDB source DDL.
 *
 * This is deliberately NOT `drizzle-kit pull` plus an eyeball. The reference
 * slice proved a schema can round-trip perfectly through introspection while
 * being wrong in every column name: introspection confirms Postgres stored what
 * it was asked for, never that the right thing was asked for. The comparison
 * has to be against the source, so that is what this does.
 *
 *   bun run db:verify
 *
 * Exits non-zero on any unreconciled difference. Deliberate differences are
 * encoded as KNOWN_EXCEPTIONS below, each with a reason, so the report stays
 * clean enough that somebody actually reads it.
 */
import 'dotenv/config';
import { Client } from 'pg';
import { loadSource, SOURCE_DDL_PATH, toSnakeCase } from './column-map';
import type { SourceColumn } from './parse-mysql-ddl';

/**
 * Differences between source and target that are intended. Anything not listed
 * here is a defect.
 */
const KNOWN_EXCEPTIONS = {
  droppedTables: {
    _prisma_migrations: "Prisma's own migration bookkeeping; the tooling is removed in #46",
  },
  /** Reasons recorded for the type divergences the mapping deliberately makes. */
  typeDivergence: {
    'varchar(191) -> text': 'the 191 sizing was an InnoDB 767-byte index artifact with no Postgres meaning (#23)',
    'longtext -> text': 'MySQL length tiers do not exist in Postgres',
    'datetime -> timestamptz': 'timestamps are stored with time zone, database TimeZone pinned to UTC (#23)',
    'tinyint(1) -> boolean': 'MySQL has no native boolean (#23)',
  },
  droppedIndexFeatures: 'prefix-length indexes become full-column indexes; Postgres has no prefix-length index',
} as const;

/** Expected Postgres type for a source column, per the #23 mapping. */
function expectedPgType(col: SourceColumn): string {
  if (col.isJson) return 'jsonb';
  switch (col.baseType) {
    case 'varchar':
      // Only the 191 default is dropped; deliberate sizing (sha256 64, md5 32,
      // color 7 ...) is kept, so both spellings are legitimate here.
      return col.length === 191 ? 'text' : 'character varying';
    case 'text':
    case 'longtext':
    case 'mediumtext':
      return 'text';
    case 'datetime':
    case 'timestamp':
      return 'timestamp with time zone';
    case 'tinyint':
      return 'boolean';
    case 'int':
      return 'integer';
    case 'bigint':
      return 'bigint';
    case 'double':
      return 'double precision';
    default:
      throw new Error(`No mapping for source type ${col.rawType}`);
  }
}

type Problem = { table: string; kind: string; detail: string };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const { tables } = await loadSource(SOURCE_DDL_PATH);
  const client = new Client({ connectionString: url });
  await client.connect();

  const { rows: pgColumns } = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: 'YES' | 'NO';
  }>(
    `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'`,
  );

  const { rows: pgForeignKeys } = await client.query<{
    table_name: string;
    column_name: string;
    target_table: string;
    target_column: string;
    delete_rule: string;
    update_rule: string;
  }>(
    `SELECT tc.table_name,
            kcu.column_name,
            ccu.table_name  AS target_table,
            ccu.column_name AS target_column,
            rc.delete_rule,
            rc.update_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  );
  const { rows: pgIndexes } = await client.query<{ table_name: string; index_name: string; columns: string }>(
    `SELECT t.relname  AS table_name,
            i.relname  AS index_name,
            string_agg(a.attname, ',' ORDER BY k.ord) AS columns
       FROM pg_class t
       JOIN pg_index ix       ON ix.indrelid = t.oid
       JOIN pg_class i        ON i.oid = ix.indexrelid
       JOIN pg_namespace n    ON n.oid = t.relnamespace
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
       JOIN pg_attribute a    ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'public' AND t.relkind = 'r'
      GROUP BY t.relname, i.relname`,
  );
  await client.end();

  const columnsByTable = new Map<string, Map<string, (typeof pgColumns)[number]>>();
  for (const row of pgColumns) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Map());
    columnsByTable.get(row.table_name)?.set(row.column_name, row);
  }

  const problems: Problem[] = [];

  for (const table of tables) {
    const applied = columnsByTable.get(table.name);
    if (!applied) {
      problems.push({ table: table.name, kind: 'missing table', detail: 'not present in the applied schema' });
      continue;
    }

    for (const col of table.columns) {
      const target = toSnakeCase(col.name);
      const appliedCol = applied.get(target);
      if (!appliedCol) {
        // The single most valuable check here: row counts alone would pass a
        // schema wrong in every name, which is exactly the trap #31 describes.
        const misnamed = applied.get(col.name);
        problems.push({
          table: table.name,
          kind: 'missing column',
          detail: misnamed
            ? `${col.name} -> expected ${target}, found the un-normalised name instead`
            : `${col.name} -> expected ${target}, absent`,
        });
        continue;
      }

      const expectedNullable = col.nullable ? 'YES' : 'NO';
      if (appliedCol.is_nullable !== expectedNullable) {
        problems.push({
          table: table.name,
          kind: 'nullability',
          detail: `${target}: source ${expectedNullable === 'YES' ? 'NULL' : 'NOT NULL'}, applied ${appliedCol.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`,
        });
      }

      const expected = expectedPgType(col);
      if (appliedCol.data_type !== expected) {
        problems.push({
          table: table.name,
          kind: 'type',
          detail: `${target}: source ${col.rawType} expects ${expected}, applied ${appliedCol.data_type}`,
        });
      }
    }

    const extra = [...applied.keys()].filter((name) => !table.columns.some((c) => toSnakeCase(c.name) === name));
    for (const name of extra) {
      problems.push({ table: table.name, kind: 'extra column', detail: `${name} has no counterpart in the source` });
    }

    const appliedFks = pgForeignKeys.filter((f) => f.table_name === table.name);
    if (appliedFks.length !== table.foreignKeys.length) {
      problems.push({
        table: table.name,
        kind: 'foreign key count',
        detail: `source ${table.foreignKeys.length}, applied ${appliedFks.length}`,
      });
    }

    for (const fk of table.foreignKeys) {
      const column = toSnakeCase(fk.column);
      const match = appliedFks.find((f) => f.column_name === column && f.target_table === fk.targetTable);
      if (!match) {
        problems.push({
          table: table.name,
          kind: 'foreign key',
          detail: `${column} -> ${fk.targetTable}.${toSnakeCase(fk.targetColumn)} is absent`,
        });
        continue;
      }
      if (match.delete_rule.toLowerCase() !== fk.onDelete) {
        problems.push({
          table: table.name,
          kind: 'foreign key ON DELETE',
          detail: `${column}: source ${fk.onDelete.toUpperCase()}, applied ${match.delete_rule}`,
        });
      }
      if (match.update_rule.toLowerCase() !== fk.onUpdate) {
        problems.push({
          table: table.name,
          kind: 'foreign key ON UPDATE',
          detail: `${column}: source ${fk.onUpdate.toUpperCase()}, applied ${match.update_rule}`,
        });
      }
    }

    // Indexes. #30 asks for every index reproduced with composites in their
    // original column order, and that was the one criterion nothing verified --
    // a declaration can name the right columns in the wrong order and no column
    // or FK check would notice.
    const appliedIndexes = pgIndexes.filter((i) => i.table_name === table.name);
    for (const index of table.indexes) {
      const expected = index.columns.map(toSnakeCase).join(',');
      const match = appliedIndexes.find((i) => i.index_name === index.name);
      if (!match) {
        const sameColumns = appliedIndexes.find((i) => i.columns === expected);
        problems.push({
          table: table.name,
          kind: 'index',
          detail: sameColumns
            ? `${index.name} (${expected}) is absent; an index with the same columns exists as ${sameColumns.index_name}`
            : `${index.name} (${expected}) is absent`,
        });
        continue;
      }
      if (match.columns !== expected) {
        problems.push({
          table: table.name,
          kind: 'index column order',
          detail: `${index.name}: source (${expected}), applied (${match.columns})`,
        });
      }
    }
  }

  for (const [name, reason] of Object.entries(KNOWN_EXCEPTIONS.droppedTables)) {
    if (columnsByTable.has(name)) {
      problems.push({ table: name, kind: 'unexpected table', detail: `should not exist — ${reason}` });
    }
  }

  const sourceTableNames = new Set(tables.map((t) => t.name));
  for (const name of columnsByTable.keys()) {
    if (sourceTableNames.has(name)) continue;
    if (name in KNOWN_EXCEPTIONS.droppedTables) continue;
    problems.push({ table: name, kind: 'extra table', detail: 'has no counterpart in the source DDL' });
  }

  const sourceColumnCount = tables.reduce((n, t) => n + t.columns.length, 0);
  const sourceFkCount = tables.reduce((n, t) => n + t.foreignKeys.length, 0);
  console.log(
    `source: ${tables.length} tables, ${sourceColumnCount} columns, ${sourceFkCount} foreign keys` +
      `\napplied: ${columnsByTable.size} tables, ${pgColumns.length} columns, ${pgForeignKeys.length} foreign keys`,
  );

  if (problems.length === 0) {
    console.log('\nschema matches the source. Deliberate differences, all reconciled:');
    for (const [name, reason] of Object.entries(KNOWN_EXCEPTIONS.droppedTables)) console.log(`  - table ${name} dropped: ${reason}`);
    for (const [change, reason] of Object.entries(KNOWN_EXCEPTIONS.typeDivergence)) console.log(`  - ${change}: ${reason}`);
    console.log(`  - ${KNOWN_EXCEPTIONS.droppedIndexFeatures}`);
    console.log('  - physical column names normalised camelCase -> snake_case (#28)');
    return;
  }

  console.error(`\n${problems.length} unreconciled difference(s):`);
  const byTable = new Map<string, Problem[]>();
  for (const p of problems) {
    if (!byTable.has(p.table)) byTable.set(p.table, []);
    byTable.get(p.table)?.push(p);
  }
  for (const [table, list] of [...byTable].sort()) {
    console.error(`\n  ${table}`);
    for (const p of list) console.error(`    [${p.kind}] ${p.detail}`);
  }
  process.exitCode = 1;
}

await main();
