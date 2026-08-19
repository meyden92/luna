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

/**
 * Parses the DDL at `path`.
 *
 * The mapping itself is `toSnakeCase` applied per column, which the transform
 * and both verifications each call against the parsed source. An earlier version
 * also materialised a `{ table: { sourceColumn: targetColumn } }` dictionary,
 * but nothing ever read it — a second representation of the same rule is exactly
 * the drift this module exists to prevent.
 */
export async function loadSource(path: string): Promise<{ tables: SourceTable[] }> {
  const ddl = await Bun.file(path).text();
  return { tables: parseMysqlDdl(ddl).filter((t) => !EXCLUDED_TABLES.has(t.name)) };
}

/** Default location of the extracted source DDL (gitignored, see #24). */
export const SOURCE_DDL_PATH = '.private/source-ddl.sql';
