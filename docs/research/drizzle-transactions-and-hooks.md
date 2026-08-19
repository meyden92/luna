# Drizzle transactions, locking, and extensibility

## Answer in brief

**No interception layer exists in Drizzle.** There is nothing analogous to Prisma's `$extends` / `$allOperations` — no query middleware, no before/after hooks, no lifecycle signals. This has been requested repeatedly since 2023 ([drizzle-orm#755](https://github.com/drizzle-team/drizzle-orm/issues/755), tracked/duplicated by [#1500](https://github.com/drizzle-team/drizzle-orm/issues/1500)) and is still unimplemented as of the most recent activity on those threads (Oct 2024 / Jan 2026 comments asking "will it be supported"). The only thing that touches every query is the `logger` option, and it only sees the compiled SQL string and bound params (`logQuery(query: string, params: unknown[])`) — it cannot see results, cannot block/alter the query, and is fire-and-forget (`void`). It is unusable for audit logging that needs before/after row snapshots. `$with`, `.$dynamic()`, and `customType` are unrelated SQL-construction/type-mapping helpers, not interception points. The community's own workaround for cross-cutting concerns is to hand-wrap the `db` object (repository/proxy pattern) — this is not an official Drizzle feature.

`db.transaction(async (tx) => ...)` exists for MySQL/MariaDB with nested savepoints, `tx.rollback()` or throwing to abort, and MySQL-specific config (`isolationLevel`, `accessMode`, `withConsistentSnapshot`) — but no `maxWait`/`timeout` equivalent (open feature request [#4214](https://github.com/drizzle-team/drizzle-orm/issues/4214)). Prisma's array-form `$transaction([...])` has no direct Drizzle counterpart on MySQL — `db.batch()` is not supported by the `mysql2` driver, so the array form must become sequential `await`s inside a `db.transaction(async (tx) => ...)` callback, which is semantically closer to Prisma's callback form than to its array form. `SELECT ... FOR UPDATE` is expressed via `.for('update', { noWait: true } | { skipLocked: true })` on the select query builder — no raw SQL needed — and this maps directly onto `src/libs/storage-quota.ts`'s current `$queryRaw ... FOR UPDATE`.

## 1. Transaction API on MySQL/MariaDB

- **Basic syntax**: `await db.transaction(async (tx) => { ... })`. Documented example: `await db.transaction(async (tx) => { await tx.update(accounts)...; await tx.update(accounts)...; })`. Source: [orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions).
- **Nesting/savepoints**: Drizzle supports nested transactions implemented as SQL savepoints — `await tx.transaction(async (tx2) => { ... })` inside an outer transaction. Source: [orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions).
- **Abort/rollback**: Two mechanisms — (a) throwing inside the callback rolls back automatically; (b) calling `tx.rollback()` explicitly, documented as embeddable in business logic ("rollback whenever needed"). At the source level, `MySqlTransaction.rollback()` is implemented by throwing a dedicated `TransactionRollbackError` (return type `never`), which the transaction driver wrapper catches to issue `ROLLBACK`. Source: [orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions); source confirmed via [drizzle-orm/src/mysql-core/session.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/mysql-core/session.ts).
- **Isolation levels / access mode / consistent snapshot (MySQL-specific)**: `MySqlTransactionConfig`:
  ```ts
  export interface MySqlTransactionConfig {
    withConsistentSnapshot?: boolean;
    accessMode?: 'read only' | 'read write';
    isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
  }
  ```
  passed as a second argument: `db.transaction(async (tx) => {...}, { isolationLevel: 'read committed', accessMode: 'read write', withConsistentSnapshot: true })`. These map to `SET TRANSACTION isolation level <level>` and `START TRANSACTION [read only|read write] [with consistent snapshot]`. Source: [drizzle-orm/src/mysql-core/session.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/mysql-core/session.ts) (the public docs page currently documents only the Postgres variant of this config — [orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions) — the MySQL-specific shape was verified directly against source, not docs). Note there was a historical bug where these options produced a MySQL syntax error, reported/fixed via [drizzle-orm#2133](https://github.com/drizzle-team/drizzle-orm/issues/2133) — worth pinning a recent `drizzle-orm` version if this option set is used.
- **Timeout equivalent to Prisma's `maxWait`/`timeout`**: **Does not exist.** No `maxWait`/`timeout` option is documented on `db.transaction()`, and there is an open, unimplemented feature request for setting session-level parameters (e.g. MySQL/Postgres `statement_timeout`-equivalent) scoped to a query/transaction: [drizzle-orm#4214 "Support for db.set()"](https://github.com/drizzle-team/drizzle-orm/issues/4214). Enforcing a transaction timeout today would require driver-level connection options (e.g. `mysql2`'s own timeouts) or application-level `Promise.race`, not a Drizzle primitive.
- **`tx` supports the full query API**: Confirmed — the docs show `await tx.query.users.findMany({ with: { accounts: true } })` (relational query builder) working identically inside a transaction. Source: [orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions).

## 2. Prisma array-form `$transaction([...])` (flows.ts:58) — Drizzle equivalent

`flows.ts:58` does:
```ts
await prisma.$transaction([
  prisma.flow.update({ where: { id: flow.id }, data: { isActive: false, enabled: false } }),
  prisma.token.updateMany({ where: { flowId: flow.id, userId }, data: { flowId: null } }),
]);
```
Prisma's array form pre-builds each query, then sends them to the database sequentially inside one transaction; none of the queries can depend on a prior query's *result* (only on values computed before the array is built), because all are constructed before any of them runs.

Drizzle has no array-form transaction API. The two candidate primitives are:
- **`db.batch(...)`** — exists, but is limited to specific HTTP/edge drivers (Neon HTTP for Postgres, and separately D1/libsql-style drivers for SQLite); the docs page for it names Neon HTTP explicitly and does not list `mysql2` as a supported driver. Source: [orm.drizzle.team/docs/batch-api](https://orm.drizzle.team/docs/batch-api). **Not usable for this MariaDB/mysql2 stack.**
- **`db.transaction(async (tx) => { await tx...; await tx...; })`** — the actual replacement. This is Drizzle's only transactional grouping mechanism on MySQL/MariaDB.

Semantic differences from Prisma's array form:
- Execution is still sequential (both approaches run statements in order on one connection), so ordering guarantees are equivalent.
- Drizzle's callback form is *more* capable, not less: because each statement is a plain `await` inside a JS function, later statements **can** depend on earlier statements' results (e.g. use an inserted id), which Prisma's array form explicitly cannot do. So `flows.ts:58` translates 1:1 with no semantic loss — and would gain the ability to make the second query depend on the first if ever needed.
- Source for the callback pattern and its capabilities: [orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions).

## 3. Row locking — `SELECT ... FOR UPDATE`

Drizzle exposes locking as a chained method on the select query builder, not raw SQL. From the MySQL query builder source:
```ts
// drizzle-orm/src/mysql-core/query-builders/select.ts
for(strength: LockStrength, config: LockConfig = {}): MySqlSelectWithout<this, TDynamic, 'for'> {
  this.config.lockingClause = { strength, config };
  return this as any;
}
```
with types (from `select.types.ts`):
```ts
export type LockStrength = 'update' | 'share';
export type LockConfig =
  | { noWait: true; skipLocked?: undefined }
  | { noWait?: undefined; skipLocked: true }
  | { noWait?: undefined; skipLocked?: undefined };
```
Source: [drizzle-orm/src/mysql-core/query-builders/select.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/mysql-core/query-builders/select.ts) and `select.types.ts` in the same directory. Note: this API exists but is explicitly **undocumented** on the public docs site — see open docs issue [drizzle-orm#2875 "Document `SELECT FOR UPDATE` and its variants"](https://github.com/drizzle-team/drizzle-orm/issues/2875) ("Drizzle has `SELECT FOR UPDATE` support ... but this is not documented anywhere"). The `noWait`/`skipLocked` mutual-exclusivity in the type also had a real bug for Postgres (`for('update', { noWait: true })` emitted `no wait` instead of `nowait`, tracked in [drizzle-orm#3554](https://github.com/drizzle-team/drizzle-orm/issues/3554)) — that bug is **Postgres-dialect-specific** (`pg-core/dialect.ts`), not MySQL, per the bug report.

Usage:
```ts
await db.select().from(users).where(eq(users.id, 1)).for('update');
await db.select().from(users).where(eq(users.id, 1)).for('update', { noWait: true });
await db.select().from(queue).where(eq(queue.status, 'pending')).limit(10).for('update', { skipLocked: true });
```

### MySQL/MariaDB support for `NOWAIT` / `SKIP LOCKED`

- MySQL: `SELECT ... FOR UPDATE|FOR SHARE [NOWAIT|SKIP LOCKED]`. `NOWAIT` fails immediately with an error if a row is locked; `SKIP LOCKED` excludes locked rows from the result set (both "only apply to row-level locks" and are "unsafe for statement-based replication"). Source: [dev.mysql.com — InnoDB Locking Reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).
- MariaDB: syntax is `[FOR UPDATE|LOCK IN SHARE MODE] [WAIT n | NOWAIT | SKIP LOCKED]`. `SKIP LOCKED` "causes rows that couldn't be locked... to be excluded from the result set"; the docs explicitly state the clause **does not exist before MariaDB 10.6** (confirmed independently by Jira ticket [MDEV-13115](https://jira.mariadb.org/browse/MDEV-13115), fixed in 10.6.0). `NOWAIT`/`WAIT n` are documented separately: `WAIT n` sets a lock-wait timeout in seconds, `NOWAIT` fails immediately if the lock can't be obtained, and `WAIT 0` is equivalent to `NOWAIT`. Sources: [mariadb.com/docs — SELECT](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/select), [mariadb.com/docs — FOR UPDATE](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/for-update), [mariadb.com/docs — WAIT and NOWAIT](https://mariadb.com/docs/server/reference/sql-statements/transactions/wait-and-nowait).
- Practical implication for this repo: verify the target MariaDB version is ≥10.6 before relying on `.for('update', { skipLocked: true })`; `.for('update')` and `.for('update', { noWait: true })` are safe on any modern MariaDB/MySQL.

### `src/libs/storage-quota.ts` rewritten in Drizzle

The full file today (read in its entirety) does one locking read (`$queryRaw ... FOR UPDATE`) plus one Prisma aggregate, both inside the caller's `prisma.$transaction`. The locking read:
```ts
const lockedUsers = await tx.$queryRaw<Array<{ storageQuotaMiB: number | null }>>`
  SELECT storage_quota_mib AS storageQuotaMiB FROM \`user\` WHERE id = ${userId} FOR UPDATE
`;
```
and the aggregate:
```ts
const used = await tx.file.aggregate({
  where: { ownerId: userId, isDeleted: false },
  _sum: { size: true },
});
```

Rewritten with Drizzle (assuming a schema module exporting `user` and `file` tables, e.g. `@/db/schema`, and a `tx` typed as the MySQL transaction handle):

```ts
import { and, eq, sql } from 'drizzle-orm';
import type { MySqlTransaction } from 'drizzle-orm/mysql-core';
import { file, user } from '@/db/schema';

type StorageQuotaTransaction = MySqlTransaction<any, any, any, any>;

export async function ensureStorageQuotaAvailable(
  tx: StorageQuotaTransaction,
  userId: string,
  incomingBytes: number,
): Promise<StorageQuotaDetails> {
  // Row lock — no raw SQL needed, replaces `$queryRaw ... FOR UPDATE`.
  const lockedUsers = await tx
    .select({ storageQuotaMiB: user.storageQuotaMiB })
    .from(user)
    .where(eq(user.id, userId))
    .for('update');

  const quotaMiB = lockedUsers[0]?.storageQuotaMiB ?? DEFAULT_STORAGE_QUOTA_MIB;
  const quotaBytes = storageQuotaMiBToBytes(quotaMiB);

  // Aggregate — replaces Prisma's `file.aggregate({ _sum: { size } })`.
  const [{ usedBytes }] = await tx
    .select({ usedBytes: sql<number>`coalesce(sum(${file.size}), 0)` })
    .from(file)
    .where(and(eq(file.ownerId, userId), eq(file.isDeleted, false)));

  const remainingBytes = Math.max(quotaBytes - usedBytes, 0);
  const details = { usedBytes, quotaBytes, remainingBytes, attemptedBytes: incomingBytes };

  if (usedBytes + incomingBytes > quotaBytes) {
    throw new StorageQuotaExceededError(details);
  }

  return details;
}
```
The `.for('update')` call and the `sql<T>` typed aggregate template are both documented/sourced above ([drizzle-orm/src/mysql-core/query-builders/select.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/mysql-core/query-builders/select.ts); [orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql) for `sql<T>` typing). No raw string SQL or manual backtick-escaping of `` `user` `` is needed — the query builder handles identifier quoting.

## 4. Extensibility

- **Is there any query middleware / interception layer analogous to Prisma's `$extends`/`$allOperations`?** **No — definitively.** This has been an open feature request since mid-2023:
  - [drizzle-orm#755 "Pre & Post Save Signals"](https://github.com/drizzle-team/drizzle-orm/issues/755) — explicitly requests something like "the middleware concept in Prisma" / TypeORM listeners/subscribers. Comment thread includes multiple independent requests through late 2024 ("Will it be supported officially in the future? This is probably the only reason why I can't use Drizzle ORM" — Oct 2024) and no maintainer commitment or shipped feature in the thread. GitHub's issue metadata marks it closed with `state_reason: completed`, but there is no comment from a maintainer announcing an implementation, and community members in the same thread continue to ask for the feature after the closure — treat the "completed" label as a bookkeeping artifact, not evidence of a shipped feature.
  - [drizzle-orm#1500 "operation interceptor"](https://github.com/drizzle-team/drizzle-orm/issues/1500) — a maintainer (`dankochetov`) replied "yes, tracked in #755" and closed it as a duplicate, i.e. explicitly rolled into the same unimplemented request.
  - [drizzle-orm discussion #1513](https://github.com/drizzle-team/drizzle-orm/discussions/1513) (proposal to extend `schema.ts` with runtime middleware) shows a maintainer (`AlexBlokh`) asking for a "real world business example" to validate an API design — i.e. still in the design-discussion stage, not shipped.
  - Community workaround shared in the #755 thread: wrap Drizzle in a hand-written "base repository" that triggers your own before/after hooks (Postgres-only implementation cited by the commenter) — this is a third-party pattern, not a Drizzle feature.

- **The `logger` option**: Interface, from source:
  ```ts
  export interface Logger {
    logQuery(query: string, params: unknown[]): void;
  }
  ```
  Source: [drizzle-orm/src/logger.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/logger.ts).
  - Receives only the **compiled SQL string** and its **bound parameter array** — no table/model name structure, no operation type, no result rows, no row identifiers beyond whatever happens to appear literally in the SQL text/params.
  - Return type is `void`; it is a synchronous, fire-and-forget callback, not `Promise<void>` — meaning it cannot block execution, transform the query, or short-circuit it, and by its type signature runs around/adjacent to execution rather than being awaited before or after it. The interface gives no explicit "before vs after" guarantee in the docs; based on its `void`/non-blocking design and the fact it only receives the query text (never a result), it is a pure observability hook, not a data hook.
  - It **cannot** observe query results (no result parameter exists in the signature) — so it structurally cannot be (ab)used for before/after-snapshot audit logging the way `prismadb.ts`'s `$allOperations` extension does; at best it could log "a write of this shape happened," not "this is what changed."
  - Enabling: `drizzle(url, { logger: true })` (built-in `DefaultLogger`) or `{ logger: new MyLogger() }` for a custom implementation. Source: [drizzle-orm/src/logger.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/logger.ts); usage pattern corroborated by an open related feature request for slow-query logging, [drizzle-orm#2916](https://github.com/drizzle-team/drizzle-orm/issues/2916), which itself confirms the current logger has no timing/result data built in (otherwise that feature request would be moot).

- **`$with`, `.$dynamic()`, `customType`, RQB extension — confirmed NOT interception**:
  - `$with` is Drizzle's CTE (Common Table Expression) builder — a SQL-construction convenience for composing subqueries, unrelated to runtime hooks. Source: [orm.drizzle.team/docs/select](https://orm.drizzle.team/docs/select) (WITH clause section).
  - `.$dynamic()` removes TypeScript's single-call-per-method restriction on the query builder so a shared function can keep calling `.where()`/`.orderBy()` etc. on a query object across multiple invocations — a compile-time typing relaxation only; it does not intercept execution or add runtime hooks. Source: [orm.drizzle.team/docs/dynamic-query-building](https://orm.drizzle.team/docs/dynamic-query-building).
  - `customType` defines custom column type transforms (`toDriver`/`fromDriver` mapping between JS and SQL types) — a type/serialization layer, not a query interceptor; it runs per-column value mapping, not per-query. Source: [drizzle-orm/docs/custom-types.md](https://github.com/drizzle-team/drizzle-orm/blob/main/docs/custom-types.md) / [orm.drizzle.team/docs/custom-types](https://orm.drizzle.team/docs/custom-types).

- **Sanctioned pattern for cross-cutting write concerns**: There is **no officially sanctioned pattern** documented by the Drizzle team. The only pattern surfacing in Drizzle's own issue tracker is community-invented: wrap the `db` instance in an application-level repository/service layer and call your own hooks explicitly around each write (as shared in [drizzle-orm#755](https://github.com/drizzle-team/drizzle-orm/issues/755)). This mirrors what `prismadb.ts` today gets "for free" via `$extends` — under Drizzle it would have to be re-implemented by hand at every call site or via a hand-rolled wrapper around the `db`/`tx` object, since there is no lower-level hook to attach to.

- **Does anything change inside `tx` vs on root `db` regarding hooks/logging?** No. The `logger` option is configured once at `drizzle(...)` client construction and applies uniformly to every query issued through that connection, including queries run via `tx` inside `db.transaction(...)` — there is no separate hook surface for transactions, and no equivalent to Prisma's `params.__internalParams?.transaction` flag (which `prismadb.ts` uses to skip the audit extension for writes already inside a transaction) exists in Drizzle, because there is no extension mechanism in the first place. Source: absence confirmed against [orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions) and [drizzle-orm/src/logger.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/logger.ts) — neither mentions any transaction-scoped logging/hook behavior distinct from the root client.

### What does NOT exist

Explicitly, none of the following provide query or write interception in Drizzle:

- No `$extends` / client-extension mechanism of any kind (Prisma's is the explicit point of comparison in the closed feature requests).
- No `$allOperations`-style catch-all query wrapper.
- No before/after save hooks, lifecycle signals, or listeners/subscribers (requested via TypeORM/Django/Flask comparisons in [#755](https://github.com/drizzle-team/drizzle-orm/issues/755); not implemented).
- No per-model or per-table hook registration.
- No `logger` result visibility — `logQuery(query, params)` never receives rows or a result set.
- No transaction-scoped hook surface distinct from the root client.
- `$with` — SQL CTE construction only, not a hook.
- `.$dynamic()` — a TypeScript typing relaxation for multi-call query building, not a hook.
- `customType` — per-column value (de)serialization, not a query-level hook.
- No `db.set()` / session-parameter injection point yet (tracked as an open, unimplemented request in [#4214](https://github.com/drizzle-team/drizzle-orm/issues/4214)), so there's no way to piggyback cross-cutting behavior on a session-variable mechanism either.
- No officially documented/sanctioned repository or proxy-wrapping pattern from the Drizzle team — only unofficial community workarounds appear in the issue tracker.

## 5. Raw SQL

- **`sql` template tag**: Parameterizes automatically — `${value}` interpolations become bound parameters (e.g. `$1`/`?` placeholders with values passed separately to the driver, not string-concatenated), and schema-object interpolations (tables/columns) are automatically rendered as properly escaped identifiers. Source: [orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql).
- **`sql.raw()`**: Includes a string verbatim, unparameterized and unescaped — explicitly documented as offering no injection protection; any user input must be validated/sanitized by the caller before use. Source: [orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql).
- **Identifier interpolation**: preferred approach is to reference schema-defined columns/tables directly inside `` sql`...` `` template literals, which Drizzle escapes automatically; a dedicated `sql.identifier()`-style escaping helper for arbitrary dynamic identifier strings also exists for cases where a schema object isn't available. Source: [orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql) (`sql` template tag reference page).
- **Typing results**: `sql<T>` annotates the expected TS type of a `sql` fragment used as a selected column (e.g. `sql<string>\`lower(${col})\``); for full raw statements executed via `db.execute(sql\`...\`)`, the return type is generic/untyped by default and should be annotated at the call site. Source: [orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql).
- **Replacements for Prisma's raw methods**:
  - `$queryRaw` → `db.execute(sql\`...\`)` (or, better, express as a normal type-safe `db.select()...` query where possible — see below).
  - `$executeRaw` → `db.execute(sql\`...\`)` as well; Drizzle does not have a separate "execute-only, no rows" raw method — `execute()` is the single primitive for arbitrary SQL, and its return shape depends on the driver (e.g. `mysql2`'s `[ResultSetHeader, FieldPacket[]]`-style tuple for DML).
  - `$queryRawUnsafe` → there is no direct "unsafe" variant with the same shape; the closest equivalent is composing a `sql\`...\`` template where any truly dynamic (non-parameterizable) fragment — e.g., a column name or `ASC`/`DESC` direction toggle — is inserted via `sql.raw()` from a hardcoded/whitelisted value, while all real data values stay inside `${}` interpolations so they remain bound parameters.
  - Source for all of the above: [orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql).

### Injection considerations at `src/server/fns/admin/users.ts:163`

Read in context: `prisma.$queryRawUnsafe<RawAdminUserListItem[]>(sqlString, ...queryParams)`. The SQL string itself contains two dynamically-inserted fragments — `searchFilter` (either `''` or the fixed literal `'AND (u.email LIKE ? OR u.name LIKE ?)'`, chosen by a ternary, never derived from raw user input) and `orderDirection` (either `'ASC'` or `'DESC'`, chosen by `data.order === 'asc' ? 'ASC' : 'DESC'`). The actual user-supplied `search` string never appears in the SQL text — it flows only through `queryParams` (`` `%${search}%` ``) as a **bound `?` parameter**, which `$queryRawUnsafe` still parameterizes despite its "unsafe" name (the "unsafe" refers to the query-string argument being an arbitrary runtime string rather than a `TemplateStringsArray`, not to disabling parameter binding). So this specific call site is not actually vulnerable to SQL injection from user input today — but the pattern relies on the two interpolated fragments always being constrained to a fixed enum of literals, which is fragile if the code is later modified to accept a wider set of columns/directions.

In a Drizzle rewrite, this whole query is expressible without any raw SQL at all — it is just a `leftJoin` + `groupBy` + conditional `where` (`or(like(...), like(...))`) + `orderBy` (`asc`/`desc` from `drizzle-orm`, applied via a real function call rather than string interpolation) + `limit`/`offset` — all of which are supported by the standard Drizzle MySQL query builder, eliminating the raw-SQL surface (and the `orderDirection`/`searchFilter` string-building pattern) entirely rather than just parameterizing it more safely.

## Open questions / unverified

- The **exact runtime/type-level behavior of `.for()` under `.$dynamic()`-built queries**, and any interaction between `for()` and the relational query builder (`db.query.*`) rather than the plain select builder, was not verified — the docs are silent (per [#2875](https://github.com/drizzle-team/drizzle-orm/issues/2875), the whole `for()` feature is undocumented) and I did not find a source confirming whether `db.query.*` relational queries support `.for()` at all.
- The **precise wording/behavior of `sql.identifier()`** (exact export name, signature) was pieced together from a WebSearch synthesis of the `sql` docs page rather than a direct quote I could fully verify character-for-character in this session; treat the existence of an identifier-escaping helper as confirmed, but do not treat the exact API name/signature above as verbatim-quoted from source.
- I could not load `orm.drizzle.team/docs/select#for` directly (malformed fetch on my first attempt caused a tool error, and I did not retry that specific anchor) — the `.for()` API details in this document are sourced from the MySQL query-builder GitHub source and search-engine summaries of the docs, not a direct fetch of the docs' `for()` section itself.
- Whether the Drizzle team has said anything more definitive/recent (post-January-2026) about middleware plans beyond discussion #1513 was not checked further than the comment thread already surfaced; discussion #1513 is a GitHub Discussion, not an Issue, and its full comment thread could not be pulled via the REST API in this session (404 — discussions use a different API), so only the WebFetch-rendered summary of that page was used, not a raw verbatim quote.
- MariaDB's exact version that introduced `NOWAIT` (as opposed to `SKIP LOCKED`, confirmed 10.6+) was not pinned down to a specific version number in the primary-source pages fetched; the WAIT/NOWAIT reference page did not state an introduction version.
- No independent verification was done against a live Drizzle+MariaDB test database in this repo (no code was run) — all findings are documentation/source-code-level, not empirically executed against `mariadb`.
