/**
 * camelCase -> snake_case physical column mapping (issues #28, #31, #32).
 *
 * Derived mechanically from the source DDL rather than hand-written: the
 * transform and the schema verification both consume it, and a hand-maintained
 * second copy would drift from the first one to be edited.
 *
 * Production is camelCase because Prisma emitted its field names verbatim, with
 * two exceptions that are already snake_case — `user.storage_quota_mib` (a later
 * Prisma `@map`) and the whole of `nicotine_entry`. Assuming one convention
 * holds across a table is how this goes wrong, so the rule is applied per
 * column, and columns already in snake_case are left alone.
 */
import { parseMysqlDdl, type SourceTable } from './parse-mysql-ddl';

/** Tables in the dump that are deliberately not carried across. */
export const EXCLUDED_TABLES = new Set([
  // Prisma's own bookkeeping — the migration tooling is being removed (#46).
  '_prisma_migrations',
]);

/**
 * A column already containing an underscore and no uppercase letter is already
 * snake_case and is returned untouched — converting it again would mangle it.
 */
export function toSnakeCase(name: string): string {
  if (!/[A-Z]/.test(name)) return name;
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/** `{ [sourceTable]: { [sourceColumn]: targetColumn } }`. */
export type ColumnMap = Record<string, Record<string, string>>;

export function buildColumnMap(tables: SourceTable[]): ColumnMap {
  const map: ColumnMap = {};
  for (const table of tables) {
    if (EXCLUDED_TABLES.has(table.name)) continue;
    map[table.name] = Object.fromEntries(table.columns.map((c) => [c.name, toSnakeCase(c.name)]));
  }
  return map;
}

/** Parses the DDL at `path` and returns both the tables and their column map. */
export async function loadSource(path: string): Promise<{ tables: SourceTable[]; columnMap: ColumnMap }> {
  const ddl = await Bun.file(path).text();
  const tables = parseMysqlDdl(ddl).filter((t) => !EXCLUDED_TABLES.has(t.name));
  return { tables, columnMap: buildColumnMap(tables) };
}

/** Default location of the extracted source DDL (gitignored, see #24). */
export const SOURCE_DDL_PATH = '.private/source-ddl.sql';
