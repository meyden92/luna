# drizzle-kit against an existing baselined MariaDB

## Answer in brief

`drizzle-kit pull` against MariaDB works for the common cases (columns, defaults, generated columns, FKs, composite PKs, JSON columns) but is confirmed-lossy on at least one thing this repo actually uses — prefix-length indexes (`key(191)` on TEXT/long VARCHAR columns) — because neither the introspection query nor Drizzle's MySQL `index()` builder has any concept of index-column length at all. MariaDB is documented as "supported" but rides entirely on the `mysql2` driver/dialect; there is no MariaDB-specific code path, and there are open, unresolved upstream bugs that are MariaDB-specific (a case-sensitivity crash in CHECK-constraint introspection, and an invalid `serial auto_increment` generation bug). Baselining the first migration is a real, documented mechanism (`drizzle-kit pull --init`, or `pull` + manual insert) but it is a **manual, unverified-by-tooling** step: you must hand-insert a row into `__drizzle_migrations` whose `hash`/`created_at` match exactly what Drizzle's own migrator would compute, or `drizzle-kit migrate` will try to re-run `CREATE TABLE` against tables that already exist. `__drizzle_migrations` uses a high-water-mark scheme (only the single most-recent row's `created_at` is compared, not a per-migration ledger), and it has no relationship to Prisma's `_prisma_migrations` table — nothing in Drizzle ever reads or writes that table, so it is inert once Prisma is removed. Drizzle-kit has no down-migration/rollback feature at all (only migrations table state is even worked on, and MySQL/MariaDB DDL isn't transactional, so a mid-migration failure isn't cleanly reversible regardless). For a Bun Docker image, the programmatic `migrate()` from `drizzle-orm/mysql2/migrator` is the better fit than the `drizzle-kit migrate` CLI: they run the identical underlying mechanism, but the programmatic form needs only `drizzle-orm` + `mysql2` + the migrations folder in the image, not the drizzle-kit CLI itself. The repo's `mariadb` package (used by `@prisma/adapter-mariadb`) has no Drizzle driver; a move to Drizzle means adding `mysql2` as a new runtime dependency.

---

## 1. `drizzle-kit pull` against MySQL/MariaDB: faithfulness

`drizzle-kit pull` introspects the live database via `information_schema` queries and (re)writes `schema.ts`/`relations.ts`, plus (when the migrations folder is empty) a baseline migration SQL file + journal entry. Source: [`drizzle-kit/src/serializer/mysqlSerializer.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-kit/src/serializer/mysqlSerializer.ts) and [`drizzle-kit/src/cli/commands/introspect.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-kit/src/cli/commands/introspect.ts) (both read directly from the `main` branch, current as of this research).

What it reads and how, confirmed from source:

- **Columns / types / defaults**: `select * from information_schema.columns ... order by table_name, ordinal_position` (`mysqlSerializer.ts:577`). `COLUMN_TYPE` (e.g. `varchar(256)`) is used verbatim as the Drizzle type string, so `TEXT` vs `VARCHAR(n)` is preserved faithfully. Defaults are parsed from `COLUMN_DEFAULT`, with special-casing for numeric literals, `DEFAULT_GENERATED` expressions (`EXTRA` containing `DEFAULT_GENERATED`), and JSON columns (`sqlTypeLowered === 'json'` wraps the default in `JSON.stringify`) — see `mysqlSerializer.ts:676-698`.
- **Generated columns**: read from `GENERATION_EXPRESSION` and `EXTRA` (`'VIRTUAL GENERATED'` vs stored) — `mysqlSerializer.ts:618-698`. Supported.
- **Auto-increment / serial heuristic**: a `bigint unsigned not null auto_increment` column that also has a unique index is rewritten to Drizzle's `serial` type (`mysqlSerializer.ts:648-660`) — this is a lossy *reinterpretation*, not a literal readback, and directly caused the MariaDB bug in Question 7 below.
- **Composite / single primary keys**: `information_schema.table_constraints` joined to `key_column_usage`, grouped by `ordinal_position`, synthesized into a composite-PK object named `${table}_${cols.join('_')}` (`mysqlSerializer.ts:740-770`). Correct for both single and composite keys.
- **Foreign keys**: `information_schema.key_column_usage` joined to `referential_constraints` for `UPDATE_RULE`/`DELETE_RULE` (`mysqlSerializer.ts:786-841`). Faithful, including onDelete/onUpdate.
- **Indexes / unique constraints**: `information_schema.statistics`, using `NON_UNIQUE = 0` to classify unique vs plain indexes, and skipping any index whose name matches an FK constraint name (MySQL/MariaDB auto-creates an index for every FK) — `mysqlSerializer.ts:863-916`.
  - **Confirmed lossy**: the `STATISTICS` query is `select *`, which includes MySQL/MariaDB's `SUB_PART` column (the index-prefix length, e.g. the `191` in `` INDEX `apikey_key_idx`(`key`(191)) `` that this repo's own baseline migration uses on several `TEXT`-backed columns). The serializer code **never reads `idxRow['SUB_PART']`** — grepped the full file, zero references. This is not just an introspection gap: Drizzle's MySQL index builder itself has no length/prefix concept at all — `IndexConfig`/`IndexColumn` in [`drizzle-orm/src/mysql-core/indexes.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/mysql-core/indexes.ts) only supports `unique`, `using` (`btree`/`hash`), `algorithm`, `lock` — no `length()`/prefix option on a column. This repo's `verification` model (`@@index([identifier(length: 191)])`) and `apikey_key_idx` (`` `key`(191) ``) are exactly this case: a prefix index on a `TEXT`/long column, which MySQL/MariaDB *requires* for indexing `TEXT`/`BLOB` (you cannot index the full column). Introspection will silently produce a full-column index definition with no length, which is invalid DDL against a `TEXT` column and would need hand-correction (or a raw-SQL migration) either way.
- **Views**: read from `INFORMATION_SCHEMA.VIEWS` (`mysqlSerializer.ts:915+`). Supported.
- **JSON columns**: represented as the `json` Drizzle type; JSON defaults are JSON-stringified on the way in. Supported.
- **CHECK constraints**: read via a join of `information_schema.table_constraints` and `information_schema.check_constraints`, selecting lowercase-written columns (`tc.table_name`, `tc.constraint_name`, `cc.check_clause`) but then indexed with **uppercase** keys (`checkConstraintRow['TABLE_NAME']`, `['CONSTRAINT_NAME']`, `['CHECK_CLAUSE']`) — `mysqlSerializer.ts:950-978`. This is the exact root cause of an **open, MariaDB-specific bug**: [Issue #5550 — "`drizzle-kit push` exits with code 1 on MariaDB when CHECK constraints exist (silent failure during schema pull)"](https://github.com/drizzle-team/drizzle-orm/issues/5550). The reporter traces it to MariaDB's `mysql2` result sets returning the field names in the case as literally written in the query (lowercase here) rather than MySQL's uppercase `information_schema` catalog casing, so `checkConstraintRow['TABLE_NAME']` is `undefined` and introspection crashes/produces garbage when the target DB has CHECK constraints. Still open as of this research.

**Is MariaDB officially supported, or only MySQL?** Documented as supported — [drizzle-orm-docs PR #262 "Add MariaDB to supported engines"](https://github.com/drizzle-team/drizzle-orm-docs/pull/262/files) added MariaDB to the landing page's database list and changed doc wording to "PostgreSQL, MySQL/MariaDB or SQLite drivers." But there is **no dedicated MariaDB dialect or driver** — Drizzle treats MariaDB purely as "MySQL via the `mysql2` npm package" (`drizzle-orm/package.json` lists only `mysql2` as the MySQL peer dependency: `"mysql2": ">=2"`; there is no `mariadb`-npm-package driver anywhere in `drizzle-orm/src`). Two more open GitHub issues that are MariaDB-specific back up "supported, but with real gaps":
  - [Issue #3333 — "Getting started with MariaDB: 'You have an error in your SQL syntax' — create table with serial auto_increment"](https://github.com/drizzle-team/drizzle-orm/issues/3333): Drizzle's `serial` type already implies `AUTO_INCREMENT` in MySQL, but the generator emits `serial AUTO_INCREMENT` explicitly, which MariaDB rejects as invalid syntax (MySQL apparently tolerates it). Open, affects drizzle-orm 0.36.0 / drizzle-kit 0.27.0 / MariaDB 10.6.5 per the report.
  - [Issue #5550](https://github.com/drizzle-team/drizzle-orm/issues/5550) above.
  - Original feature tracking: [Issue #203 "Support MariaDB"](https://github.com/drizzle-team/drizzle-orm/issues/203) (marked "Done" on the roadmap) and [PR #1692 "Add support for Maria DB (core API implementation)"](https://github.com/drizzle-team/drizzle-orm/pull/1692).

---

## 2. Baselining the first Drizzle migration

The documented mechanism is `drizzle-kit pull --init` against the live database:

> "You can use the `--init` flag to mark the pulled schema as an applied migration in your database, so that all subsequent migrations are diffed against the initial one."
> — [orm.drizzle.team/docs/drizzle-kit-pull](https://orm.drizzle.team/docs/drizzle-kit-pull)

Mechanically, from source inspection of [`drizzle-kit/src/cli/commands/introspect.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-kit/src/cli/commands/introspect.ts) (`introspectMysql`, ~line 330-410): a `pull` run, when the migrations folder has zero existing entries, always writes `schema.ts`, `relations.ts`, and diffs an empty schema against the introspected one to produce a full-`CREATE TABLE` migration file plus a `meta/_journal.json` entry — this is all **local, file-only**. Nothing in this code path opens a write connection to the target database's `__drizzle_migrations` table. (Note: in the current `main`-branch source of the CLI's option parser, `[cli-schema.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-kit/src/cli/schema.ts)`, no `--init`-named flag was found wired into the `pull` command definition at the time of this research — this is a discrepancy between the published docs and the exact code I could locate on `main`; flagged in "Open questions" below.)

Because `pull`/`--init` never touches the database, the actual "prevent `drizzle-kit migrate` from recreating existing tables" step has to be done by hand: insert a row into `__drizzle_migrations` that matches exactly what Drizzle's own migrator would compute for that generated baseline file. From [`drizzle-orm/src/migrator.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/migrator.ts) (`readMigrationFiles`):

```ts
migrationQueries.push({
  sql: result,
  bps: journalEntry.breakpoints,
  folderMillis: journalEntry.when,
  hash: crypto.createHash('sha256').update(query).digest('hex'),
});
```

`hash` = SHA-256 hex digest of the **raw migration `.sql` file content** (not per-statement); `folderMillis` = the `when` timestamp recorded for that migration in `meta/_journal.json`. So the manual baselining step is:

```sql
INSERT INTO __drizzle_migrations (hash, created_at)
VALUES ('<sha256 hex of drizzle/0000_xxx.sql>', <journal entry "when", ms epoch>);
```

executed *before* the first `drizzle-kit migrate`/programmatic `migrate()` run against the real database. Everything after that baseline row is compared against it (see Question 3) and only newer migrations get applied.

The `--custom` flag (`drizzle-kit generate --custom --name=...`) is a related but different mechanism — [orm.drizzle.team/docs/kit-custom-migrations](https://orm.drizzle.team/docs/kit-custom-migrations) — it produces an **empty** timestamped `.sql` file for hand-written DDL/data-seed statements not otherwise expressible in the TS schema DSL. It is not itself a baselining tool: an empty custom migration executed via `drizzle-kit migrate` would insert a valid tracking row, but only produces a correct starting *snapshot* for future diffing if the schema.ts it's paired with already matches the live DB (i.e., it still needs an accurate `pull` first). It is useful for statements `drizzle-kit` cannot generate at all (its docs example is CHECK constraints and data seeding), which is relevant here given the CHECK-constraint introspection bug above.

---

## 3. `__drizzle_migrations` table schema and semantics

From the actual MySQL dialect migrate implementation, [`drizzle-orm/src/mysql-core/dialect.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/mysql-core/dialect.ts) (`MySqlDialect.migrate`, ~lines 54-98):

```ts
async migrate(migrations, session, config) {
  const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
  const migrationTableCreate = sql`
    create table if not exists ${sql.identifier(migrationsTable)} (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;
  await session.execute(migrationTableCreate);

  const dbMigrations = await session.all(
    sql`select id, hash, created_at from ${sql.identifier(migrationsTable)} order by created_at desc limit 1`,
  );
  const lastDbMigration = dbMigrations[0];

  await session.transaction(async (tx) => {
    for (const migration of migrations) {
      if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) {
        for (const stmt of migration.sql) {
          await tx.execute(sql.raw(stmt));
        }
        await tx.execute(
          sql`insert into ${sql.identifier(migrationsTable)} (\`hash\`, \`created_at\`) values(${migration.hash}, ${migration.folderMillis})`,
        );
      }
    }
  });
}
```

Key findings, directly from this code:

- Table: `id serial primary key, hash text not null, created_at bigint` — three columns only, plain table, no schema/database namespacing for MySQL specifically. (The `MigrationConfig.migrationsSchema` option exists for Postgres-style schemas, but the MySQL `migrate` signature is typed `Omit<MigrationConfig, 'migrationsSchema'>` — it is explicitly excluded, i.e. not applicable for MySQL. The generic docs page's example showing `migrations: { schema: 'drizzle' }` as a MySQL default is therefore not reflected in the MySQL dialect's actual implementation.)
- **Decision logic is a high-water mark, not a per-migration ledger**: it fetches only the single most-recently-applied row (`order by created_at desc limit 1`), then applies *every* migration file whose journal `folderMillis` is strictly greater than that one timestamp. It does not check each individual migration's hash against the table; the `hash` column is written but never read back for comparison in this code path. Migrations must therefore stay strictly ordered by their folder timestamp, and history gaps/edits are not independently detected the way Prisma's `_prisma_migrations` checksum-per-row model does.
- The `drizzle-kit migrate` CLI uses this exact same function for MySQL — see Question 6.

---

## 4. What happens to Prisma's `_prisma_migrations` table

Prisma's own baselining/migration-history docs describe the table's *purpose* but not its full column list:

> "A `_prisma_migrations` table in the database, which is used to check: if a migration was run against the database; if an applied migration was deleted; if an applied migration was changed."
> — [prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/migration-histories](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/migration-histories)

I could not find a Prisma docs page that lists `_prisma_migrations`' full column schema explicitly (checked the migration-histories, mental-model, and troubleshooting pages — none give the complete column list; see "Open questions"). The one column confirmed by name in the docs is `logs` ("Each migration in the `_prisma_migrations` table has a `logs` column that stores the error" — troubleshooting page).

What is confirmed from source review of `drizzle-orm`/`drizzle-kit` (this research's own grep across `mysqlSerializer.ts`, `dialect.ts`, `migrator.ts`, `connections.ts`, `introspect.ts`): **nothing in Drizzle's code reads, writes, or references `_prisma_migrations`, and `drizzle-kit pull`'s own introspection query explicitly excludes `__drizzle_migrations`** (`where table_schema = '${inputSchema}' and table_name != '__drizzle_migrations'`, `mysqlSerializer.ts:577`) but does **not** have a corresponding exclusion for `_prisma_migrations` — meaning a plain `drizzle-kit pull` against a database that still has Prisma's tracking table would introspect `_prisma_migrations` as an ordinary application table and emit a Drizzle schema entry for it, unless excluded via `tablesFilter`. That is a concrete, actionable finding: when running `pull`, pass a `tablesFilter` (or `schemaFilter`) that excludes `_prisma_migrations`, matching the same convention Drizzle applies to its own tracking table.

Whether it is safe to *leave the table in place* vs. *drop it*: this is not covered by primary-source docs for a Prisma→Drizzle transition specifically (checked [patching-and-hotfixing](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing) — not covered). Reasoning from confirmed facts only: since no Drizzle code path touches the table, and Prisma's engine only reads it when a Prisma CLI command (`prisma migrate deploy/status/resolve`) is actually invoked, leaving it in place is inert as long as no Prisma migrate command is ever run again; dropping it is safe in the same sense, *provided* `db:migrate`/`prisma migrate deploy` and the Prisma CLI are fully retired from the deploy pipeline — if anything still calls `prisma migrate deploy` (this repo's `package.json` `db:migrate` script) after the table is dropped, that command would fail or attempt to recreate migration history from scratch. This paragraph is inference from confirmed source facts, not a documented Prisma/Drizzle statement — treat accordingly.

---

## 5. Rollback story

Drizzle-kit has **no down-migration / rollback command** today. Confirmed via the project's own roadmap:

> "Down migrations, better rollbacks and improvements to `migrate` experience in Drizzle Kit"
> — listed as a planned, not-yet-shipped V1-roadmap item at [orm.drizzle.team/roadmap](https://orm.drizzle.team/roadmap)

Open feature requests corroborate this is still unimplemented: [Issue #4005 "Reverse/Down Migrations"](https://github.com/drizzle-team/drizzle-orm/issues/4005), [Issue #5067 "Native support for reverting migration"](https://github.com/drizzle-team/drizzle-orm/issues/5067), [Issue #2901 "Drizzle Kit Rollback failed migration in mysql"](https://github.com/drizzle-team/drizzle-orm/issues/2901). The sanctioned approach, per the absence of any built-in mechanism, is the standard "roll forward" pattern: hand-write a new migration that undoes the previous change.

Separately — and this matters specifically for MySQL/MariaDB — even the *in-flight* atomicity of a single migration run is weaker than it looks. `dialect.ts`'s `migrate()` wraps all pending migrations in one `session.transaction()` call (see Question 3 code), but MySQL/MariaDB DDL statements are **not transactional** (`CREATE TABLE`/`ALTER TABLE` auto-commit); this is exactly the failure mode reported in [Issue #2510 — "Drizzle migration does not rollback if it fails"](https://github.com/drizzle-team/drizzle-orm/issues/2510), filed against PlanetScale MySQL: a multi-statement migration that fails partway through leaves the already-executed DDL statements committed, "It appears that the migration didn't run within a single transaction." So the `transaction()` wrapper provides no real safety net for DDL-heavy migrations on this stack; the only realistic recovery path for a failed migration is manual forward-fix or restoring from a database backup.

---

## 6. Deployment mechanics: what replaces `prisma migrate deploy`

Repo context confirmed by reading the files directly: `db:migrate` → `prisma migrate deploy` (`package.json`), and it is **not** invoked anywhere in the container itself — the `Dockerfile`'s `CMD` only starts the app (`bun .output/server/index.mjs`), and `docker-compose.yml` has no init/migrate step. So today, `prisma migrate deploy` is run out-of-band (manually, or via some deployment-platform hook not present in this repo — see "Open questions").

Two candidate replacements, both confirmed from source to route through the same underlying mechanism for MySQL:

**`drizzle-kit migrate` (CLI)** — from [`drizzle-kit/src/cli/connections.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-kit/src/cli/connections.ts) (`connectToMySQL`, ~line 741): at runtime it checks for the `mysql2` package (`checkPackage('mysql2')`), then dynamically imports `mysql2/promise`, `drizzle-orm/mysql2`, and — critically — `drizzle-orm/mysql2/migrator`, and calls that same `migrate(db, config)` function. Requirements to run this inside the image: the `drizzle-kit` CLI itself (and its dependency tree — it's a sizeable TS-aware CLI, not a thin runtime shim) present in `node_modules`, a `drizzle.config.ts`, the migrations folder (`drizzle/*.sql` + `drizzle/meta/_journal.json` + snapshots) copied into the image, `mysql2` installed, and credentials resolvable from env/config. Invocation is a separate process (`bunx drizzle-kit migrate` / `npx drizzle-kit migrate`), meaning either an extra container/init-job step or a manual pre-deploy command — structurally identical to how `prisma migrate deploy` is invoked today.

**Programmatic `migrate()` from `drizzle-orm/mysql2/migrator`** — [orm.drizzle.team/docs/migrations](https://orm.drizzle.team/docs/migrations):

```ts
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';

const db = drizzle(pool);
await migrate(db, { migrationsFolder: './drizzle' });
```

This is a plain `drizzle-orm` import (already a would-be dependency), requiring only the migrations folder to be present (read via `fs.readFileSync` in [`migrator.ts`](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/migrator.ts): `readMigrationFiles` needs `${migrationsFolder}/meta/_journal.json` plus each `${tag}.sql` file — no `drizzle.config.ts`, no CLI, no TypeScript/`tsx` runtime needed at runtime since it's ordinary JS running inside the already-bundled/compiled server code). It can be called at server boot (before `bun .output/server/index.mjs` starts serving) or as a small standalone script run the same way `db:migrate` is invoked today.

**For this repo's minimal multi-stage Bun/Alpine image** (`Dockerfile`, which deliberately strips the runner stage down to `.output`, `prisma`, `.prisma`, `node_modules`, `package.json`), the programmatic `migrate()` is the better fit: it avoids shipping the drizzle-kit CLI and its dependency tree into the production image (mirroring the existing pattern of *not* running `prisma migrate deploy` inside the container at all), needs only the `drizzle/` migrations folder copied in alongside the existing `COPY --from=builder .../prisma` step, and doesn't require a TS-execution runtime in the image (`drizzle-kit` itself is a Node/TS CLI; the plain `migrate()` import runs as compiled JS). `drizzle-kit migrate` remains appropriate for local/dev/CI use where the full `drizzle-kit` toolchain is already present.

---

## 7. Driver choice on MariaDB, given the existing `@prisma/adapter-mariadb`

The repo currently depends on `@prisma/adapter-mariadb` (`^7.8.0`) plus the underlying `mariadb` npm connector package (`^3.5.3`, `src/libs/prismadb.ts:1,63`) — the official [MariaDB Node.js connector](https://github.com/mariadb-corporation/mariadb-connector-nodejs), a driver distinct from `mysql2`.

Drizzle has **no driver for the `mariadb` npm package**. Confirmed from `drizzle-orm`'s own `package.json` peerDependencies (`"mysql2": ">=2"`) and its source tree (`drizzle-orm/src/mysql2`, `drizzle-orm/src/mysql-proxy`, `drizzle-orm/src/mysql-core` — no `mariadb`-named driver directory exists). Migrating to Drizzle means adding `mysql2` as a new runtime dependency and routing all queries and migrations through it; the existing `mariadb`/`@prisma/adapter-mariadb` packages would become unused once Prisma is removed.

Does `mysql2` work correctly against MariaDB specifically? The picture from primary sources is "yes for ordinary querying, with documented gaps at the tooling/schema-generation layer":
- Drizzle's own docs treat MySQL/MariaDB as effectively one target via `mysql2` (PR [drizzle-orm-docs#262](https://github.com/drizzle-team/drizzle-orm-docs/pull/262/files): "PostgreSQL, MySQL/MariaDB or SQLite drivers").
- But the MariaDB-specific bugs already covered above — [#3333](https://github.com/drizzle-team/drizzle-orm/issues/3333) (invalid `serial AUTO_INCREMENT` syntax generated against MariaDB) and [#5550](https://github.com/drizzle-team/drizzle-orm/issues/5550) (case-sensitivity crash reading `information_schema` CHECK-constraint result sets from MariaDB via `mysql2`) — are both still open at the time of this research and both stem from `mysql2` returning MariaDB result-set metadata differently than MySQL's in edge cases, not from `mysql2` being unable to connect/query MariaDB in general.

---

## Open questions / unverified

- **`--init` flag wiring**: docs at [orm.drizzle.team/docs/drizzle-kit-pull](https://orm.drizzle.team/docs/drizzle-kit-pull) describe an `--init` flag for `pull` that "marks the pulled schema as an applied migration," but I could not locate that flag actually parsed/handled in the `pull`/`introspect` command definitions on the `drizzle-orm` `main` branch (`drizzle-kit/src/cli/schema.ts`, `drizzle-kit/src/cli/commands/introspect.ts`) at the time of this research — the default `pull` behavior I *did* confirm in source (write a baseline migration file + journal entry locally, never touch the target DB's tracking table) is consistent with the docs' description of what `--init` is supposed to achieve, but I cannot confirm whether `--init` changes that behavior, is a no-op alias, or reflects a version of the CLI not present on `main` at fetch time. Treat the exact CLI-flag mechanics as unconfirmed; the manual `__drizzle_migrations` insert described in Question 2 is confirmed directly from the migrator's source and is the reliable fallback regardless of `--init`'s exact behavior.
- **`_prisma_migrations` full column schema**: Prisma's official docs describe the table's purpose and mention only the `logs` column by name; I found no primary Prisma docs page giving the complete column list (commonly cited elsewhere as `id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count` — not verified here against a primary Prisma source, so not stated as fact above).
- **"Safe to drop `_prisma_migrations`"**: no primary Prisma or Drizzle source document directly addresses decommissioning `_prisma_migrations` when moving to a different migration tool. The conclusion in Question 4 (inert once Prisma CLI commands are retired) is derived from confirmed facts about what each tool's code touches, not from an explicit statement in either project's docs.
- **How `prisma migrate deploy` is actually triggered against production today**: confirmed from repo files that it is *not* run inside the Docker image or via `docker-compose.yml`; the actual trigger (manual run, a Coolify pre-deployment command, or something else) lives outside this repository and was not something I could verify from the files present.
- **`drizzle-kit push` CHECK-constraint bug (#5550) fix status**: confirmed open with a linked PR (#5566) at fetch time; not confirmed whether it has since merged, since I did not re-check post-fetch.
