/**
 * Parser for the MariaDB source DDL (issues #31, #32).
 *
 * The migration's whole safety story rests on diffing the applied Postgres
 * schema against the *source*, not against itself: the reference slice proved a
 * schema can round-trip perfectly through `drizzle-kit pull` while being wrong
 * in every column name. So the source DDL is parsed here once and consumed by
 * both the schema verification and the data transform.
 *
 * Input is the `CREATE TABLE` blocks extracted verbatim from the production
 * dump. The dump is Navicat format rather than mysqldump, but its `CREATE TABLE`
 * bodies are ordinary MariaDB DDL.
 */

export type SourceColumn = {
  /** Physical name in MariaDB — camelCase for most of production. */
  name: string;
  /** Raw type text, e.g. `varchar(191)`, `datetime(3)`, `tinyint(1)`. */
  rawType: string;
  baseType: string;
  length: number | null;
  nullable: boolean;
  /** Raw DEFAULT expression, or null when the column has none. */
  default: string | null;
  /** longtext columns carrying a `json_valid` CHECK are Prisma `Json`. */
  isJson: boolean;
};

export type SourceIndex = {
  name: string;
  columns: string[];
  unique: boolean;
  /** Prefix-length indexes (`KEY x (col(191))`) — dropped deliberately. */
  hasPrefixLength: boolean;
};

export type SourceForeignKey = {
  name: string;
  column: string;
  targetTable: string;
  targetColumn: string;
  onDelete: 'cascade' | 'set null' | 'restrict' | 'no action';
  onUpdate: 'cascade' | 'set null' | 'restrict' | 'no action';
};

export type SourceTable = {
  name: string;
  columns: SourceColumn[];
  primaryKey: string[];
  indexes: SourceIndex[];
  foreignKeys: SourceForeignKey[];
};

const TICK = '`';

/**
 * Reads a capture group that the surrounding regex guarantees is present.
 * `noUncheckedIndexedAccess` cannot see that guarantee, and silently defaulting
 * to `''` would turn a parser bug into a wrong schema that verifies clean.
 */
function group(match: RegExpMatchArray, index: number): string {
  const value = match[index];
  if (value === undefined) throw new Error(`Expected capture group ${index} in: ${match[0]}`);
  return value;
}

function unquote(s: string): string {
  return s.replaceAll(TICK, '').trim();
}

/** Splits a comma-separated column list, tolerating prefix lengths. */
function splitColumnList(body: string): { columns: string[]; hasPrefixLength: boolean } {
  const parts = body.split(',').map((p) => p.trim());
  let hasPrefixLength = false;
  const columns = parts.map((p) => {
    const m = p.match(/^`([^`]+)`(?:\((\d+)\))?$/);
    if (!m) return unquote(p);
    if (m[2]) hasPrefixLength = true;
    return group(m, 1);
  });
  return { columns, hasPrefixLength };
}

function parseReferentialAction(clause: string, keyword: 'DELETE' | 'UPDATE'): SourceForeignKey['onDelete'] {
  const m = clause.match(new RegExp(`ON ${keyword} (CASCADE|SET NULL|RESTRICT|NO ACTION)`, 'i'));
  // MySQL's default for an omitted clause is RESTRICT. Postgres' is NO ACTION;
  // they differ only in constraint deferrability, but the source semantics are
  // what the verification compares against, so name RESTRICT explicitly.
  if (!m) return 'restrict';
  return group(m, 1).toLowerCase() as SourceForeignKey['onDelete'];
}

/** Parses every `CREATE TABLE` block in the given DDL text. */
export function parseMysqlDdl(ddl: string): SourceTable[] {
  const tables: SourceTable[] = [];
  const blocks = ddl.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\) ENGINE=/g);

  for (const block of blocks) {
    const table: SourceTable = {
      name: group(block, 1),
      columns: [],
      primaryKey: [],
      indexes: [],
      foreignKeys: [],
    };

    for (const rawLine of group(block, 2).split('\n')) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line) continue;

      const fk = line.match(/^CONSTRAINT `([^`]+)` FOREIGN KEY \(`([^`]+)`\) REFERENCES `([^`]+)` \(`([^`]+)`\)(.*)$/i);
      if (fk) {
        table.foreignKeys.push({
          name: group(fk, 1),
          column: group(fk, 2),
          targetTable: group(fk, 3),
          targetColumn: group(fk, 4),
          onDelete: parseReferentialAction(group(fk, 5), 'DELETE'),
          onUpdate: parseReferentialAction(group(fk, 5), 'UPDATE'),
        });
        continue;
      }

      const pk = line.match(/^PRIMARY KEY \(([^)]*(?:\([^)]*\))?[^)]*)\)/i);
      if (pk) {
        table.primaryKey = splitColumnList(group(pk, 1)).columns;
        continue;
      }

      const key = line.match(/^(UNIQUE )?KEY `([^`]+)` \((.*?)\)(?: USING \w+)?$/i);
      if (key) {
        const { columns, hasPrefixLength } = splitColumnList(group(key, 3));
        table.indexes.push({ name: group(key, 2), columns, unique: Boolean(key[1]), hasPrefixLength });
        continue;
      }

      const col = line.match(/^`([^`]+)` ([a-z]+(?:\(([0-9,]+)\))?)(.*)$/i);
      if (col) {
        const rest = group(col, 4);
        const defaultMatch = rest.match(/DEFAULT (.+?)(?: ON UPDATE| COMMENT| CHECK |$)/i);
        const rawType = group(col, 2);
        const lengthText = col[3]?.split(',')[0];
        table.columns.push({
          name: group(col, 1),
          rawType,
          baseType: rawType.replace(/\(.*\)$/, '').toLowerCase(),
          length: lengthText ? Number(lengthText) : null,
          nullable: !/NOT NULL/i.test(rest),
          default: defaultMatch ? group(defaultMatch, 1).trim() : null,
          isJson: /json_valid/i.test(rest),
        });
        continue;
      }

      if (/^(CHECK|CONSTRAINT)/i.test(line)) continue;
      throw new Error(`Unparsed DDL line in \`${table.name}\`: ${rawLine}`);
    }

    tables.push(table);
  }

  return tables;
}
