# Drizzle relational queries vs LunaShare's include/select shapes

## Answer in brief

Drizzle's relational query API (`db.query.*.findMany({ with })`) covers most of what this codebase actually does with Prisma's `include`/`select`: nested `with`, per-relation `where`/`orderBy`/`limit`/`offset`, and simultaneous column-picking of the parent row and nested relations via `columns` are all directly supported and documented. The two shapes it does **not** cover are Prisma's `_count` (relation counts, used in 5 of our 56 distinct `include`-bearing queries) and `groupBy`/`aggregate` (9 + 8 sites) — both fall back to Drizzle's core `db.select()` builder, with `db.$count()` as the relation-count workaround. The bigger risk for this project specifically is the database: LunaShare runs MariaDB via the `mariadb` npm driver, and Drizzle's relational query builder emits `LEFT JOIN LATERAL` by default on the MySQL dialect — which MariaDB does not support. A dedicated `drizzle-orm/mariadb` driver (that defaults to the LATERAL‑free "planetscale mode" SQL instead) exists only as an **unmerged, long-open pull request** as of the most recent data found. Separately, this repo has not installed `drizzle-orm`/`drizzle-kit` yet, and the "latest" npm-stable version (0.45.2) ships the *original* `relations()`/RQBv1 API, not the new `defineRelations()`/RQBv2 API that current docs mostly describe — RQBv2 is only available on the `@rc` pre-release tag (`1.0.0-rc.5`) as of this research. Relation declarations are 100% hand-written either way; `drizzle-kit pull` can auto-generate a `relations.ts` once from a live database's foreign keys, but nothing keeps a hand-authored `relations()`/`defineRelations()` object in sync with later schema edits.

## Step 1 — Measured taxonomy

### Methodology

- Counts below come from `grep -rn` over `src/**/*.ts(x)`, followed by manual inspection to strip false positives.
- `include:` and `select:` distinct **call sites** (as opposed to raw grep line matches, which double-count when a nested `include`/`select` block puts the token on its own line) were built by reading every one of the 22 files containing `include:` in full context (100% coverage, 56 distinct queries found) and every one of the 48 files containing `select:` (48/48 files opened; short, unambiguous one-line `select: { field: true, ... }` grep hits were classified directly from the visible line without an extra `Read` call, everything else — larger/nested blocks — was read with surrounding context). This is a full pass, not a random sample of a subset, but the select-only tally (67 distinct queries) is a manual line-by-line count and could be off by one or two.
- `groupBy` and `.aggregate(` sites (9 and 8) were each small enough to read in full (100% coverage).
- "Total Prisma call sites" was measured precisely as `prisma.<model>.<method>(` for the CRUD/query methods (`findMany/findFirst/findUnique/(...)OrThrow/create/createMany/update/updateMany/upsert/delete/deleteMany/count/groupBy/aggregate`) — this exactly reproduces the requester's ~261 estimate. A separate `tx.<model>.<method>(` count (calls made inside `prisma.$transaction` callbacks) adds another 29, for 290 total query calls including transactional ones.

### Confirmed counts

| Metric | Raw grep matches | False positives found | Real count |
|---|---|---|---|
| `include:` (line matches) | 63 | 3 (prose text "may include:" in `src/routes/_privacy/privacy.tsx`) | 60 |
| `select:` (line matches) | 105 | 4 (TanStack Router's `useLocation({ select: (loc) => loc.pathname })`, not Prisma) | 101 |
| `groupBy` | 9 | 0 | 9 |
| `.aggregate(` | 8 | 0 | 8 |
| `prisma.<model>.<method>(` (query/CRUD calls, no `tx.`) | — | — | **261** (matches requester's estimate exactly) |
| `tx.<model>.<method>(` (inside `$transaction` callbacks) | — | — | 29 |
| Total query calls (`prisma.` + `tx.`) | — | — | 290 |
| Prisma models (`prisma/schema.prisma`, `^model `) | — | — | 38 (matches the ~38 estimate) |

Because a single Prisma call with `include` nested inside `include` puts the literal token `include:` on more than one line, the 60 real `include:` line matches collapse to **56 distinct `include`-bearing query call sites** once nested lines belonging to the same call are merged — this is the number the taxonomy table below is built from. `select:`-only queries (queries with a top-level `select` and no `include` at all) come out to **~67 distinct query call sites**.

### Taxonomy of `include`-bearing queries (56 distinct call sites, full coverage)

| Shape | Count | Notes |
|---|---|---|
| Flat single-level `include` (plain `relation: true`, no filters/nesting) | 12 | e.g. `include: { user: true }` |
| `include` with a filtered/ordered/limited relation (`where`/`orderBy`/`take`/`skip` nested one level in) | 22 | Largest bucket — almost always `orderBy` + optional `take` |
| Nested 2+ level `include` (`include` inside `include`) | 3 | All 3 also nest an `orderBy` inside the deepest level |
| `select` nested inside `include` (column-picking of an included relation) | 14 | Very common for "just give me id/name/email of the related user" |
| `_count` usage inside `include` | 5 | 4 of the 5 additionally filter the counted relation with a nested `where` |

Cross-cutting note: some queries qualify for more than one bucket (e.g. the 3 nested-include queries also have an `orderBy` nested at the deepest level, and 2 of the 14 select-nested-in-include queries have two separate relations each getting their own `select`). Each query above was bucketed by its most complex/distinguishing shape; overlaps are called out in the representative examples below.

### `select`-only queries (no `include` at all, ~67 distinct call sites, full file coverage)

The overwhelming majority (~60 of 67) are **flat top-level scalar column-picking with zero relation columns** — e.g. `select: { id: true, title: true, url: true }` — a shape not explicitly named in the ticket's list but functionally trivial (equivalent to Drizzle's `columns` on a relation-free query, or a plain core `.select({...})`). A smaller subset does the `select`-based equivalent of "select nested inside include" — column-picking a relation's fields via a nested `select` instead of `include` (e.g. `src/server/fns/files.ts:209-221`, `src/server/fns/platform.ts:265-270`, `src/server/fns/ai.ts:182`, `src/server/fns/admin/users.ts:318-322`, `src/libs/oembed-data.ts:14-22`) — 5 sites. And 2 sites use `_count` nested inside a top-level `select` rather than `include` (`src/server/fns/dashboard/profile.ts:16-24`, filtered; `src/server/fns/form-shares.ts:14-22`, unfiltered).

### Representative real examples

**1. Flat include with a filtered/ordered/limited relation** — `src/libs/tasks/db-loader.ts:9-20`
```ts
const tasks = await prisma.task.findMany({
  where: { enabled: true },
  include: {
    executions: {
      orderBy: { startedAt: 'desc' },
      take: 1, // Get the most recent execution
    },
  },
});
```

**2. Nested 2-level include (include inside include)** — `src/routes/api/generate/template/stream.ts:97-102`
```ts
const template = await prisma.template.findUnique({
  where: { id: templateId, isActive: true },
  include: {
    editingModel: { include: { fields: { orderBy: { sortOrder: 'asc' } } } },
    globalVariables: { include: { globalVariable: true } },
  },
});
```

**3. `_count` with a filtered nested relation** — `src/server/fns/folders.ts:10-15`
```ts
return prisma.folder.findMany({
  where: { ownerId: userIdFromCtx(context), isDeleted: false },
  include: { _count: { select: { files: { where: { isDeleted: false } } } } },
  orderBy: { createdAt: 'desc' },
});
```

**4. `select` nested inside `include` (two relations, columns picked on each)** — `src/server/fns/admin/tasks.ts:258-266`
```ts
prisma.taskExecution.findMany({
  where,
  orderBy: getExecutionOrderBy(direction),
  take: limit + 1,
  include: {
    task: { select: { id: true, name: true, description: true } },
    executedByUser: { select: { id: true, name: true, email: true } },
  },
}),
```

**5. Top-level `select` (no `include`) with a filtered relation count** — `src/server/fns/dashboard/profile.ts:14-25`
```ts
const user = await prisma.user.findUnique({
  where: { id: data.id },
  select: {
    id: true, name: true, image: true, bio: true, description: true,
    role: true, isProfilePublic: true,
    _count: { select: { File: { where: { isDeleted: false } } } },
  },
});
```

**6. `groupBy` + `aggregate` pair (no include/select at all)** — `src/libs/tasks/execution-service.ts:252-269`
```ts
const stats = await prisma.taskExecution.groupBy({
  by: ['status'],
  where: { taskId, startedAt: { gte: startDate } },
  _count: { status: true },
});
const avgDuration = await prisma.taskExecution.aggregate({
  where: { taskId, status: 'success', startedAt: { gte: startDate } },
  _avg: { durationMs: true },
});
```

## Step 2 — Mapping each shape to Drizzle's relational query API

### Version note (read this first)

Section headers below cite the **current live docs at orm.drizzle.team**, which as of this research already document the *v2* `defineRelations()` API (object-based `where`/`orderBy`, `through()` for many-to-many) as the default. See item 8 for why that matters: the npm `latest` tag is still the *v1* `relations()` API.

### 1. Nested `with`, and per-relation `where`/`orderBy`/`limit`/`columns` inside `with`

Nesting is explicitly unbounded: "You can chain nested with statements as much as necessary" ([orm.drizzle.team/docs/rqb](https://orm.drizzle.team/docs/rqb)). `where`, `orderBy`, `limit`, and `offset` are all supported per-relation inside a `with` block, including `offset` inside nested relations (a v2 addition per the migration guide: "`offset` now can be used in with tables as well!", [orm.drizzle.team/docs/relations-v1-v2](https://orm.drizzle.team/docs/relations-v1-v2)). `columns` composes with `with` to pick columns of the parent row and of nested relations simultaneously in one query, documented with a worked example ([orm.drizzle.team/docs/guides/include-or-exclude-columns](https://orm.drizzle.team/docs/guides/include-or-exclude-columns)):
```ts
await db.query.posts.findMany({
  columns: { id: true },
  with: {
    comments: { columns: { userId: false, postId: false } },
    user: true,
  },
});
```
This directly covers our taxonomy's flat-include (12), filtered/ordered/limited-relation (22), nested-include (3), and select-nested-in-include (14) buckets — 51 of the 56 distinct `include`-bearing queries in this codebase.

**Verdict:** direct

### 2. Relation counts — Prisma's `_count` equivalent

There is no `_count`-style option inside `with`. The relational query docs state aggregations are out of scope for the relation-query "extras" mechanism and point at core queries instead ("As of now aggregations are not supported in `extras`", use core queries — [orm.drizzle.team/docs/rqb](https://orm.drizzle.team/docs/rqb)). The documented workaround is `db.$count(relatedTable, condition)` used as a field inside a core `db.select()` (subquery), or a hand-written `sql` count. Our 5 `_count` sites (including the `_count` + nested `where` filter pattern used in `folders.ts` and `profile.ts` above) have no relational-API equivalent and would need to move to core `db.select()`.

**Verdict:** needs hand-written join or core select

### 3. `columns`-style partial selection composing with `with`

Same citation as item 1 ([orm.drizzle.team/docs/guides/include-or-exclude-columns](https://orm.drizzle.team/docs/guides/include-or-exclude-columns)): `columns` on the top-level query and `columns` inside each `with` entry compose freely and independently in a single call — this maps directly onto both "select nested inside include" (14 sites) and the select-only relation-column-picking shape (5 sites) found in Step 1.

**Verdict:** direct

### 4. SQL emitted on MySQL/MariaDB, and performance caveats

On the MySQL dialect, Drizzle's relational query builder emits `LEFT JOIN LATERAL` subqueries with JSON aggregation (`json_arrayagg`) per relation by default (source: `buildRelationalQuery`/`lateralSql` handling in [drizzle-orm/src/mysql-core/dialect.ts](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/mysql-core/dialect.ts); confirmed in maintainer discussion — relational queries "use lateral joins of subqueries", [discussion #1211](https://github.com/drizzle-team/drizzle-orm/discussions/1211)). Because PlanetScale (Vitess) doesn't support `LATERAL`, the mysql2 driver has a `mode: 'planetscale'` connection option that switches the same relational queries to correlated subqueries + JSON aggregation instead of `LATERAL` ([orm.drizzle.team/docs/mysql/connect-planetscale](https://orm.drizzle.team/docs/mysql/connect-planetscale); [discussion #1211](https://github.com/drizzle-team/drizzle-orm/discussions/1211)). A real, documented compatibility failure on this exact code path exists: on MySQL 5.7, a `db.query` call with a nested relation throws `"You have an error in your SQL syntax ... near '(select coalesce(json_arrayagg(...'"` because that MySQL version can't handle the generated construct ([issue #1100](https://github.com/drizzle-team/drizzle-orm/issues/1100)).

**This is the single most important finding for LunaShare specifically**: MariaDB does not support `LEFT JOIN LATERAL` either. There is currently **no dedicated `drizzle-orm/mariadb` driver package** shipped in any released version — [issue #2007](https://github.com/drizzle-team/drizzle-orm/issues/2007) ("Add `mode: mariadb` to `mysql`", open since March 2024, still open) documents exactly this failure mode: *"mariadb doesn't support lateral derived tables, because my SQL for `db.query` failed on `LEFT JOIN LATERAL`."* The fix lives in [PR #1692](https://github.com/drizzle-team/drizzle-orm/pull/1692), which adds a first-class driver for the `mariadb` npm package (the exact driver this repo already depends on) and states: *"When creating an instance of `MySqlDatabase` using the `mariadb` driver, Planetscale mode is used by default as Maria DB doesn't support `left join lateral`."* As of the most recent activity visible at time of research (~March 2026), **that PR is still open/unmerged**, despite ~73 thumbs-up reactions and comments asking for it to land.

Practical implication: running `db.query.*.findMany({ with })` against LunaShare's MariaDB today, using a stock `mysql2`-style connection in default mode, risks hitting the same `LEFT JOIN LATERAL` syntax error documented in #1100/#2007. The available workaround (manually forcing `mode: 'planetscale'` on a `mysql2` connection pointed at MariaDB) is undocumented for MariaDB specifically and not confirmed as fully supported by any primary source found.

On round-trips: Drizzle frames relational queries as emitting "a single SQL statement" rather than doing N+1 round-trips per relation ([orm.drizzle.team/docs/rqb](https://orm.drizzle.team/docs/rqb)); no MariaDB-version-specific `JSON_ARRAYAGG`/window-function compatibility matrix was found in Drizzle's own docs (see Open Questions).

**Verdict:** needs hand-written join or core select — on this project's actual database (MariaDB via the `mariadb` driver), the direct `with`-based path is not safely usable until PR #1692 ships or an undocumented `mode: 'planetscale'` workaround is verified.

### 5. Where `groupBy` and aggregate operations land

Aggregation and `groupBy` are core-`db.select()`-only. `.groupBy()` chains after `.from()` in the core query builder, and `count()`/`sum()`/`avg()` are imported helper functions used inside a `.select({...})` projection ([orm.drizzle.team/docs/select](https://orm.drizzle.team/docs/select)). The relational query docs contain no `groupBy`/aggregate examples and explicitly redirect aggregation use cases to core queries ([orm.drizzle.team/docs/rqb](https://orm.drizzle.team/docs/rqb)). All 9 `groupBy` and 8 `.aggregate(` call sites in this codebase (task-execution stats, egress rollups, storage quota, dashboard settings overview) have zero equivalent in `db.query.*` and must be written as core `db.select()...groupBy()`/aggregate-helper queries.

**Verdict:** not expressible currently (in the relational API) — core `db.select()` is required for all 17 of these sites.

### 6. Partial selections and inferred TypeScript types vs Prisma's generated types

`columns` and `with` selections flow directly into per-call inferred return types with no code generation step — this is a structural difference from Prisma, which generates a `.prisma/client` package with concrete named types per model/query shape. Drizzle's own GitHub issue tracker has multiple **open, unresolved** reports specifically about TypeScript inference correctness/performance on the relational query API and its ecosystem: [#4823](https://github.com/drizzle-team/drizzle-orm/issues/4823) ("Extremely slow TypeScript inference when using drizzle-zod with nestjs", drizzle-orm 0.44.3, reported open, minimal repro with a single table/column), [#3277](https://github.com/drizzle-team/drizzle-orm/issues/3277) ("Deep nested queries" — a large `with`-heavy query on v0.35.3 produces incorrect/made-up column names in type errors), [#676](https://github.com/drizzle-team/drizzle-orm/issues/676) (generated SQL for deeply nested `with` + one-to-one joins is correct but TypeScript fails to infer the resulting type correctly), and [#3072](https://github.com/drizzle-team/drizzle-orm/issues/3072) (broken type inference after a version upgrade in a NestJS project). None of these were confirmed fixed via WebFetch in this research pass — see Open Questions.

A widely repeated claim that Drizzle needs "~40,000 TypeScript type instantiations vs Prisma's few hundred" on large schemas traces back to a Prisma-authored blog post, not Drizzle's own docs or GitHub — per this task's no-blog-posts sourcing rule, that specific figure is **not used as a confirmed fact** here and is flagged in Open Questions instead.

**Verdict:** direct (the mechanism — types are inferred automatically from `columns`/`with`, no codegen step) — but carries a real, primary-source-documented reliability/performance risk at scale that is unresolved as of the issues found.

### 7. Cost of declaring `relations()`/`defineRelations()` for ~38 models

Relations are hand-written either way. In the current-docs (v2) `defineRelations()` API, all relations for the whole schema are declared once in a single centralized object using `r.one`/`r.many`/`from`/`to`/`through` (for many-to-many join tables), rather than scattered per-table declarations as in v1's `relations(table, ({one, many}) => ({...}))` with `fields`/`references` ([orm.drizzle.team/docs/relations](https://orm.drizzle.team/docs/relations); [orm.drizzle.team/docs/relations-v1-v2](https://orm.drizzle.team/docs/relations-v1-v2)). Drizzle's own docs are explicit that relations are an **application-level-only abstraction with no runtime tie to the database**: *"relations are a higher level abstraction ... used to define relations between tables on the application level only. They do not affect the database schema in any way"* ([orm.drizzle.team/docs/relations](https://orm.drizzle.team/docs/relations)) — meaning nothing errors or warns if a hand-written relation drifts from the actual foreign keys after a later schema change; it would just silently produce wrong/empty joins.

`drizzle-kit` does auto-generate relations, but only as a one-time introspection step against an existing live database, not as an ongoing generator tied to schema edits: `drizzle-kit pull` produces `schema.ts`, a `meta` snapshot folder, a migration SQL file, **and a `relations.ts` file inferred from the database's actual foreign keys**, and docs recommend manually merging that generated code into your real schema file ("The result of introspection will be a `schema.ts` file, `meta` folder ..., sql file ... and `relations.ts` file for relational queries" / "We recommend transferring the generated code from `drizzle/schema.ts` and `drizzle/relations.ts` to the actual schema file" — [orm.drizzle.team/docs/get-started/mysql-existing](https://orm.drizzle.team/docs/get-started/mysql-existing)). A feature request asking for exactly this ("`drizzle-kit introspect` should generate relations in generated `schema.ts`") is filed as [issue #3358](https://github.com/drizzle-team/drizzle-orm/issues/3358) and is now **closed**, consistent with the `pull` behavior documented above, though the closing PR/commit was not independently identified in this research.

For LunaShare's actual migration path — porting from a code-first `prisma/schema.prisma` with 38 `@relation`-annotated models rather than starting from a bare database — the practical options are: (a) hand-port each Prisma `@relation` into a Drizzle relation (mechanical but 100% manual, ~38 models' worth), or (b) run `drizzle-kit pull` against the live MariaDB database (whose FK constraints Prisma already created) to bootstrap `relations.ts` once, then reconcile naming/typing back into the hand-authored schema. Either way, nothing keeps relations in sync automatically after that point.

**Verdict:** needs hand-written (one-time `drizzle-kit pull` introspection can bootstrap it from live FKs, but ongoing sync with schema changes is manual)

### 8. Which Drizzle relations API version this research documents, and version-shipped-in-this-repo check

`package.json` in this repo has **no `drizzle-orm` or `drizzle-kit` dependency at all** — only `prisma@^7.8.0`, `@prisma/client@^7.8.0`, and `@prisma/adapter-mariadb@^7.8.0` are present, and no drizzle config/schema files exist anywhere in the repo (confirmed via `find`). This is a pre-migration research branch; there is nothing pinned to check.

Checking the drizzle-orm npm registry directly (`npm dist-tag`) as of this research: the `latest` tag is **`drizzle-orm@0.45.2`** (and `drizzle-kit@0.31.10`), which ships the **original `relations()`/RQBv1 API** — callback-based `where`/`orderBy` (`where: (users, { eq }) => eq(users.id, 1)`), and relations declared with `fields`/`references`. The `rc` tag is **`drizzle-orm@1.0.0-rc.5`** (`drizzle-kit@1.0.0-rc.5`), which ships **RQBv2** as the default `db.query` API — object-based `where`/`orderBy` (`where: { id: 1 }`), `defineRelations()`, and `through()` for many-to-many — with old v1-style calls still reachable during a migration window via `db._query` ([orm.drizzle.team/docs/relations-v1-v2](https://orm.drizzle.team/docs/relations-v1-v2), exact code shown: `db._query.users.findMany({ where: (users, { eq }) => eq(users.id, 1) })` vs `db.query.users.findMany({ where: { id: 1 } })`). **1.0.0 has not reached general availability** — the most recent tags observed were `1.0.0-rc.1` through `1.0.0-rc.5`, still release-candidate.

**All of Step 2's citations above are to the current live docs at orm.drizzle.team, which already document the v2 (`defineRelations()`) syntax as default** — meaning if LunaShare runs a plain `bun add drizzle-orm drizzle-kit` today, it would get the *v1* API (0.45.2), not what most of the current docs describe; getting v2 requires explicitly installing the `@rc` tag and accepting pre-GA stability risk.

Do v1 and v2 differ meaningfully on the points above? Per the migration guide: `where`/`orderBy` syntax (callback → object) changes, `offset` inside nested `with` is new in v2, and many-to-many gets a dedicated `through()` helper replacing v1's pattern of declaring the join table as an explicit relation participant ([orm.drizzle.team/docs/relations-v1-v2](https://orm.drizzle.team/docs/relations-v1-v2)). The absence of a `_count` equivalent and the core-select-only status of `groupBy`/aggregate appear to hold in **both** versions — no v1-only or v2-only aggregation capability was found in either the relational-queries docs or the migration guide. The MySQL/MariaDB `LEFT JOIN LATERAL` SQL-emission behavior (item 4) is a dialect-layer concern below the relational-query-API version — PR #1692's MariaDB driver work targets the dialect/driver layer, not the relations-API version, so it is expected to affect v1 and v2 equally, though this was not separately confirmed against v2 in the sources found.

**Verdict:** N/A — this is a version-identification question rather than an expressibility question; see the finding above (repo has no drizzle dependency; npm `latest` = v1/0.45.2; `rc` = v2/1.0.0-rc.5; v2 not yet GA).

## Open questions / unverified

- **PR #1692 (MariaDB driver) merge status**: confirmed open/unmerged as of the most recent activity visible during this research (~March 2026). Its exact status *today* (current date per this session, August 2026) was not re-checked beyond that fetch; the PR could plausibly have merged or stalled further since. This is the single highest-impact unknown for this project, since it directly determines whether `db.query` nested `with` queries work against LunaShare's MariaDB out of the box.
- **Whether a manual `mode: 'planetscale'` override on a `mysql2`-style connection against MariaDB is a safe, fully-supported workaround today**: no primary source explicitly confirms this combination (MariaDB + forced planetscale mode) is tested/supported; PR #1692's own description implies it's the intended internal default for a MariaDB-specific driver, but that driver isn't shipped yet.
- **MariaDB-version-specific `JSON_ARRAYAGG`/window-function/lateral-subquery compatibility matrix**: not found in Drizzle's own docs. Only a MySQL 5.7 failure case ([issue #1100](https://github.com/drizzle-team/drizzle-orm/issues/1100)) was found as a concrete documented incompatibility; no equivalent MariaDB-version breakdown exists in primary sources located.
- **Current resolution status of the TypeScript-inference issues cited in item 6** (#4823, #3277, #676, #3072): fetched summaries show them as open/unresolved at time of fetch, but full comment threads (including any maintainer triage, linked fixes, or "wontfix" labeling) were not exhaustively reviewed.
- **The "~40,000 type instantiations vs Prisma's few hundred" figure**: explicitly excluded as unverified — its only source found was a Prisma-authored blog post, not Drizzle's docs, changelog, or GitHub issues, and the no-blog-posts sourcing rule for this research excludes it as a confirmed fact.
- **Which closing PR/commit implemented `drizzle-kit pull`'s auto-generated `relations.ts`** (closing [issue #3358](https://github.com/drizzle-team/drizzle-orm/issues/3358)): not identified; only the current doc's description of the resulting behavior was confirmed.
- **Whether `defineRelations()` (v2) has a documented TypeScript compile-time performance profile different from v1's `relations()`**: not found in any primary source checked.
- **Exact select-only distinct-call-site count (~67)**: this is a manual line-by-line tally built while reading all 48 files containing `select:`, not a machine-verified dedup like the include-bearing count (56, cross-checked twice); treat ±1-2 as plausible counting slack.
- **drizzle-kit `pull` behavior specifically against MariaDB** (as opposed to MySQL): the `relations.ts`-generation quote in item 7 comes from the generic `mysql-existing` get-started guide; given MariaDB's documented dialect gaps in Drizzle (issue #2007, discussion #2436), whether introspection against a real MariaDB instance produces fully correct output was not independently verified.
