# Better-Auth on Drizzle: schema ownership and generation

Scope: this document is scoped strictly to **`better-auth@1.6.26`** (the version installed in this repo, satisfying the `^1.6.23` range in `package.json`), and the sibling packages released alongside it at the same version: `@better-auth/core`, `@better-auth/drizzle-adapter`, `@better-auth/prisma-adapter`, `@better-auth/kysely-adapter`, `@better-auth/cli`. Source claims are pinned to the GitHub tag [`v1.6.26`](https://github.com/better-auth/better-auth/tree/v1.6.26) (commit `a16b30e`). Where a docs page could not be pinned to a version (the public docs site tracks the latest release, currently ahead of 1.6.26 — releases up to `v1.7.1` exist), this is called out explicitly wherever it affected a finding.

## Answer in brief

- Today, Better-Auth **owns and generates** the auth schema *into Prisma's schema file* (`prisma/schema.prisma`) via `auth:migrate` → `bunx @better-auth/cli generate --output ./prisma/schema.prisma`. Prisma's own migration tooling then applies it to MariaDB.
- On Drizzle, ownership shifts: Better-Auth's CLI can still *generate* a schema file (a hand-editable `.ts` file with `mysqlTable(...)` definitions, default name `auth-schema.ts`), but it **cannot migrate** it — `@better-auth/cli migrate` is hard-coded to the built-in Kysely adapter only and explicitly refuses to run for Drizzle or Prisma. So schema ownership moves from "Better-Auth generates + Prisma migrates" to "Better-Auth generates a suggestion + Drizzle Kit (`drizzle-kit generate`/`push`) migrates."
- Because the auth tables already exist in production with Prisma-derived names, the realistic workflow is **not** "run the Drizzle generator and let it create tables" — it's "hand-write (or hand-edit a generated) Drizzle schema whose table/column names exactly match the existing MariaDB tables," then tell `betterAuth()` about any name that doesn't match Better-Auth's own internal defaults via `modelName`/`fields`.
- Good news specific to this repo: because the existing `user`/`session`/`account`/`verification` tables in `prisma/schema.prisma` were themselves generated **by** Better-Auth (via `auth:migrate`) using Prisma's adapter, their table names (`@@map("user")`, `@@map("session")`, `@@map("account")`, `@@map("verification")`) and column names already equal Better-Auth's own defaults. That means, for the four core auth tables, a Drizzle schema written with default `mysqlTable("user", ...)`-style names should need little to no `modelName`/`fields` remapping — the one exception is the app's own bolt-on column `storage_quota_mib` on `user`, which is not a Better-Auth field at all and just needs a normal Drizzle column alias.

---

## 1. How `drizzleAdapter` expects the schema to be declared

Import path and config type, quoted verbatim from [`packages/drizzle-adapter/src/drizzle-adapter.ts` @ v1.6.26](https://github.com/better-auth/better-auth/blob/v1.6.26/packages/drizzle-adapter/src/drizzle-adapter.ts):

```typescript
export interface DrizzleAdapterConfig {
	/**
	 * The schema object that defines the tables and fields
	 */
	schema?: Record<string, any> | undefined;
	/**
	 * The database provider
	 */
	provider: "pg" | "mysql" | "sqlite";
	/**
	 * If the table names in the schema are plural
	 * set this to true. For example, if the schema
	 * has an object with a key "users" instead of "user"
	 */
	usePlural?: boolean | undefined;
	/**
	 * Enable debug logs for the adapter
	 * @default false
	 */
	debugLogs?: DBAdapterDebugLogOption | undefined;
	/**
	 * By default snake case is used for table and field names
	 * when the CLI is used to generate the schema. If you want
	 * to use camel case, set this to true.
	 * @default false
	 */
	camelCase?: boolean | undefined;
	/**
	 * Whether to execute multiple operations in a transaction.
	 *
	 * If the database doesn't support transactions,
	 * set this to `false` and operations will be executed sequentially.
	 * @default false
	 */
	transaction?: boolean | undefined;
}

export const drizzleAdapter = (db: DB, config: DrizzleAdapterConfig) => { /* ... */ }
```

There is no `schemaName` field in the actual v1.6.26 config type (the public docs page mentions a `schemaName` option for Postgres namespacing — not present in the pinned 1.6.26 interface above, so treat that as a newer-version doc artifact; see "Open questions").

`schema` resolution — if you don't pass `schema` explicitly, the adapter falls back to `db._.fullSchema` (Drizzle's own introspected schema on the db instance), quoted from the same file:

```typescript
function getSchema(model: string) {
	const schema = config.schema || db._.fullSchema;
	if (!schema) {
		throw new BetterAuthError(
			"Drizzle adapter failed to initialize. Schema not found. Please provide a schema object in the adapter options object.",
		);
	}
	const schemaModel = schema[model];
	if (!schemaModel) {
		throw new BetterAuthError(
			`[# Drizzle Adapter]: The model "${model}" was not found in the schema object. Please pass the schema directly to the adapter options.`,
		);
	}
	return schemaModel;
}
```

Import path options, from [`packages/better-auth/package.json` @ v1.6.26](https://github.com/better-auth/better-auth/blob/v1.6.26/packages/better-auth/package.json) `exports` field — the `better-auth` package re-exports the same adapter as a thin proxy, so both of the following resolve to the identical implementation in `@better-auth/drizzle-adapter`:

```json
"./adapters/drizzle": {
  "dev-source": "./src/adapters/drizzle-adapter/index.ts",
  "types": "./dist/adapters/drizzle-adapter/index.d.mts",
  "default": "./dist/adapters/drizzle-adapter/index.mjs"
}
```
```json
"@better-auth/drizzle-adapter": "workspace:*"
```
Peer deps declared on that same package.json: `"drizzle-orm": "^0.45.2"` (optional), `"drizzle-kit": ">=0.31.4"` (optional) — matching the confirmed facts for this repo.

So either:
```typescript
import { drizzleAdapter } from "better-auth/adapters/drizzle";
// or, equivalently at this version:
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
```

Basic usage shape (from [the Drizzle adapter docs page](https://www.better-auth.com/docs/adapters/drizzle) — this docs page is not version-pinned and may reflect a release newer than 1.6.26, but the shape matches the pinned interface above):

```typescript
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "mysql",
    schema, // your Drizzle schema module (e.g. `import * as schema from "./db/schema"`)
    usePlural: false,
  }),
});
```

For custom table/column names, the docs show mapping the `schema` object's keys, and separately doing the actual name change at the Drizzle table-definition level:

```typescript
// map the internal model key "user" to a differently-named Drizzle table export
database: drizzleAdapter(db, {
  provider: "mysql",
  schema: { ...schema, user: schema.users },
})
```
```typescript
// rename an individual column at the Drizzle schema level
export const user = mysqlTable("user", {
  email: varchar("email_address", { length: 255 }),
});
```

Caveat found directly in code but absent from the docs page: the adapter warns at runtime if you combine MySQL with `generateId: false`, because MySQL's `INSERT` doesn't support `RETURNING` (detailed in section 5).

---

## 2. Does `@better-auth/cli generate`/`migrate` support Drizzle?

Source: [`packages/cli/src/commands/generate.ts`](https://github.com/better-auth/better-auth/blob/v1.6.26/packages/cli/src/commands/generate.ts) and [`packages/cli/src/commands/migrate.ts`](https://github.com/better-auth/better-auth/blob/v1.6.26/packages/cli/src/commands/migrate.ts) @ v1.6.26.

**`generate`** — works for Drizzle, Prisma, and the built-in Kysely adapter; it inspects `adapter.id` and dispatches to a per-ORM generator (`generateDrizzleSchema` / `generatePrismaSchema` / `generateMigrations` for Kysely, per the [CLI docs page](https://www.better-auth.com/docs/concepts/cli), not version-pinned but consistent with the source's `db.id === "drizzle" | "prisma" | "kysely"` branching found in `migrate.ts`, see below).

- For Drizzle: outputs a `.ts` file with `mysqlTable`/`pgTable`/`sqliteTable` definitions (hand-editable Drizzle schema code), not SQL.
- Default output filename confirmed directly from `generate.ts` source: **`auth-schema.ts`** (not `schema.ts` as the non-pinned docs page states — this is a discrepancy between the live docs and the pinned 1.6.26 source; see "Open questions").
- `--output` lets you redirect it, `--config` points at the auth config file (this repo's script already does `--config ./src/libs/auth/auth.ts`), `--adapter` can force a mock adapter/provider for generation without a live DB connection.
- Dialect mapping quoted from source: `if (dialect === "postgresql") { provider = "pg"; }` — i.e. the Drizzle generator maps a detected/declared "postgresql" dialect string to Drizzle's `"pg"` provider literal internally.

**`migrate`** — is **Kysely-only**, explicitly and by design. Quoted verbatim (via raw source fetch) from `migrate.ts`:

```
if (db.id !== "kysely") {
  // ... branches per adapter id below
}
```

Adapter-specific guidance embedded in the CLI's own error messages:

```
"Invalid database configuration. Make sure you're not using adapters.
Migrate command only works with built-in Kysely adapter."
```
```
"The migrate command only works with the built-in Kysely adapter. For
Prisma, run `npx auth generate` to create the schema, then use Prisma's
migrate or push to apply it."
```
```
"The migrate command only works with the built-in Kysely adapter. For
Drizzle, run `npx auth generate` to create the schema, then use Drizzle's
migrate or push to apply it."
```
```
"Migrate command isn't supported for this adapter."
```

**Conclusion for this repo:** the existing `"auth:migrate"` script name is misleading once Drizzle is adopted — `@better-auth/cli generate` is the only thing that still does anything meaningful for Drizzle (schema *suggestion* only), and applying the schema becomes Drizzle Kit's job (`drizzle-kit generate` + `drizzle-kit push`/`migrate`, per [Drizzle's own migration docs](https://orm.drizzle.team/docs/migrations)), not `@better-auth/cli migrate`.

---

## 3. Mapping the Drizzle schema onto EXISTING Prisma-created table/column names

Two independent, composable mechanisms, both documented at [`https://www.better-auth.com/docs/concepts/database`](https://www.better-auth.com/docs/concepts/database) (not version-pinned, but the `modelName`/`fields` API shape is core and unlikely to have changed since 1.6.26 — the field mapping described here matches the config surface already used for the `admin` plugin fields that exist in this repo's `prisma/schema.prisma`):

**(a) Better-Auth-side field/model mapping — `modelName` and `fields`.** This tells Better-Auth's *internal* model/field names to resolve to different names when talking to the adapter — it does not touch your Drizzle table definitions at all:

```typescript
export const auth = betterAuth({
  user: {
    modelName: "users",        // if your Drizzle table export/model key isn't "user"
    fields: {
      name: "full_name",       // Better-Auth's internal "name" maps to this key
      email: "email_address",
    },
  },
  session: {
    modelName: "user_sessions",
    fields: {
      userId: "user_id",
    },
  },
});
```
Per the docs: "Type inference in your code will still use the original field names (e.g., `user.name`, not `user.full_name`)" — i.e. this remapping is invisible to application code that calls `auth.api.*`; it only affects what key Better-Auth looks up on the adapter/schema side.

For plugin-added fields (e.g. the `admin` plugin's `banned`/`banReason`/`banExpires`/`impersonatedBy`), the same field-mapping pattern is applied under the plugin's own `schema` option rather than the top-level model config, per the docs:
```typescript
adminPlugin({
  schema: {
    user: {
      fields: {
        banned: "is_banned",
      },
    },
  },
})
```

**(b) Drizzle-side physical name mapping — the table/column definitions themselves.** The `modelName`/`fields` remap in (a) only changes what *key* Better-Auth looks up in your `schema` object / on the returned row — the Drizzle table and column definitions are what actually determine the real MariaDB identifiers Drizzle Kit will emit/expect. Per [the Drizzle adapter docs](https://www.better-auth.com/docs/adapters/drizzle) and [Drizzle's own MySQL column reference](https://orm.drizzle.team/docs/column-types/mysql), the physical DB name is the first string argument to a column/table builder; the object key is only the JS-side accessor:

```typescript
// db/schema.ts
import { mysqlTable, varchar, boolean, datetime, int } from "drizzle-orm/mysql-core";

export const user = mysqlTable("user", {          // physical table name: "user" (matches @@map("user"))
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: datetime("createdAt").notNull(),
  updatedAt: datetime("updatedAt").notNull(),
  // app-owned column, not a Better-Auth field, but lives in the same physical table:
  storageQuotaMiB: int("storage_quota_mib").notNull().default(2048),
});
```

Combined, for a hypothetical case where names truly diverge from Better-Auth's defaults (e.g. a table renamed to `users` and a column renamed to `full_name`), you'd write:

```typescript
// db/schema.ts
export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  full_name: varchar("full_name", { length: 255 }).notNull(),
  // ...
});

// auth.ts
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "mysql",
    schema: { ...schema, user: schema.users },   // (a) tells the adapter which schema-object
                                                   //     key resolves the "user" model
  }),
  user: {
    modelName: "users",                           // matches the schema-object key above
    fields: { name: "full_name" },                // maps Better-Auth's "name" field
  },
});
```

**Repo-specific finding:** because `prisma/schema.prisma`'s `User`/`Session`/`Account`/`Verification` models were generated *by Better-Auth itself* (via `auth:migrate`, targeting Prisma's own default naming), their `@@map()` table names (`user`, `session`, `account`, `verification`) and field names (camelCase — `id`, `email`, `emailVerified`, `createdAt`, `updatedAt`, `userId`, `expiresAt`, `token`, `ipAddress`, `userAgent`, `impersonatedBy`, `accountId`, `providerId`, `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password`, `identifier`, `value`, `role`, `banned`, `banReason`, `banExpires`) already equal Better-Auth's own defaults for those four models. A hand-written Drizzle schema using the plain default names (`mysqlTable("user", { id: varchar("id", ...), email: varchar("email", ...), ... })`) should require **no** `modelName`/`fields` overrides for the core Better-Auth fields — the only genuinely custom mapping needed in this repo is the app-owned `storage_quota_mib` column on `user` (not a Better-Auth field, handled purely at the Drizzle column-alias level as shown above, no Better-Auth config needed since Better-Auth doesn't know about that field at all unless declared via `additionalFields`).

---

## 4. Plugin/feature cross-reference: Drizzle vs Prisma adapter behavior

| Feature | Extra schema? | Documented adapter-specific difference? |
|---|---|---|
| `admin` plugin | Yes — adds `role`, `banned`, `banReason`, `banExpires` to `user`; `impersonatedBy` to `session`. Confirmed present already in `prisma/schema.prisma` (fields match exactly) and documented at [`/docs/plugins/admin`](https://www.better-auth.com/docs/plugins/admin). | No documented Drizzle-vs-Prisma behavioral difference found. The admin docs page presents the schema in a single unified table/column list without adapter-specific caveats. **Practical (undocumented-as-a-"caveat" but structurally true) consequence for Drizzle**: on Prisma, `@better-auth/cli generate` edits `schema.prisma` in place, so plugin-added fields show up automatically; on Drizzle, since production ownership here means hand-writing/hand-editing the `.ts` schema rather than re-running the generator over it, these plugin columns must be added to the hand-written Drizzle schema manually (this is an operational consequence of workflow choice, not a documented adapter limitation). |
| `tanstackStartCookies` (from `better-auth/tanstack-start`) | None documented. [TanStack Start integration docs](https://better-auth.com/docs/integrations/tanstack) describe it purely as a cookie-setting plugin for TanStack Start's server-function/response model, with no schema section. | No documented difference; docs' own example even pairs it with `drizzleAdapter` directly, with no caveat noted. |
| `socialProviders.discord` | No plugin-added tables — social sign-in persists into the existing `account` table (`providerId`, `accountId`, tokens), already present in `prisma/schema.prisma`. | No documented Drizzle-vs-Prisma difference found for social providers generally; not adapter-specific in the docs. |
| `databaseHooks.user.create.after` | No schema. Documented at [`/docs/concepts/database`](https://www.better-auth.com/docs/concepts/database) under "Database Hooks": "Database hooks allow you to define custom logic that can be executed during the lifecycle of core database operations... for the following models: **user**, **session**, and **account**." | Docs present a single adapter-agnostic API; no distinction between Drizzle/Prisma/Kysely for hook execution timing or behavior was found. |
| `session.cookieCache` | None — it's a signed, client-held cookie cache (not a DB table), per [`/docs/concepts/session-management`](https://better-auth.com/docs/concepts/session-management)/[`/docs/reference/options`](https://better-auth.com/docs/reference/options): "the server can check session validity from the cookie itself instead of hitting the database each time." | No documented adapter-specific caveat found; it sits above the adapter layer entirely (it's an optimization for `getSession`, not a schema/adapter feature). |

No caveat is invented for any row above beyond what's explicitly stated in the cited docs/source; where nothing adapter-specific was documented, that is stated plainly rather than guessed at.

---

## 5. Known gaps/caveats: Drizzle adapter vs Prisma adapter (MySQL/MariaDB focus)

All quotes from [`packages/drizzle-adapter/src/drizzle-adapter.ts`](https://github.com/better-auth/better-auth/blob/v1.6.26/packages/drizzle-adapter/src/drizzle-adapter.ts) and [`packages/drizzle-adapter/src/query-builders.ts`](https://github.com/better-auth/better-auth/blob/v1.6.26/packages/drizzle-adapter/src/query-builders.ts) @ v1.6.26 unless noted.

**Transaction support** — off by default, and only wraps `db.transaction()` when explicitly enabled:
```typescript
transaction:
  (config.transaction ?? false)
    ? (cb) =>
        db.transaction((tx: DB) => {
          const adapter = createAdapterFactory({
            config: { ...adapterOptions!.config, transaction: false },
            adapter: createCustomAdapter(tx, true),
          })(lazyOptions!);
          return cb(adapter);
        })
    : false,
```
The JSDoc on `transaction` in the config interface states: "If the database doesn't support transactions, set this to `false` and operations will be executed sequentially." The doc/source do not name a specific MySQL/MariaDB driver limitation — the `false` default appears to be a general portability default (e.g. for transaction-incapable backends like PlanetScale's older HTTP driver), not something documented as MySQL-specific; do not read more into it than that.

**ID generation on MySQL — the one clearly MySQL-specific, documented gap.** MySQL doesn't support `INSERT ... RETURNING`, so with `generateId: false` the adapter falls back to best-effort row lookup after insert:
```typescript
if (
  config.provider === "mysql" &&
  options.advanced?.database?.generateId === false &&
  !mysqlNoIdWarned
) {
  mysqlNoIdWarned = true;
  logger.warn(
    "[Drizzle Adapter] MySQL does not support INSERT...RETURNING. " +
      "With generateId set to false, the adapter uses best-effort fallback " +
      "strategies (unique columns, full-field match) to retrieve inserted rows. " +
      'For reliable behavior, use Better Auth\'s default ID generation, a custom generateId function, or generateId: "serial" for auto-increment.',
  );
}
```
And a dedicated `"serial"` fallback path exists for MySQL auto-increment PKs, using `LAST_INSERT_ID()`:
```typescript
if (options.advanced?.database?.generateId === "serial" && schemaModel.id) {
  const lastInsertId = await tx
    .select({ id: sql`LAST_INSERT_ID()` })
    .from(schemaModel)
    .limit(1)
    .execute();
  // retrieve inserted row by lastInsertId
}
```
This repo's Prisma schema uses `String @id` (UUID/cuid-style string IDs, not auto-increment) for all four auth tables, so this fallback path is not directly relevant unless `generateId` is deliberately set to `false`/`"serial"` — Better-Auth's default ID generation (its own string ID generator) is what already applies today via Prisma and should continue to apply unchanged via Drizzle.

**Custom field support** — no adapter-specific caveat found; `additionalFields` (documented at [`/docs/concepts/database`](https://www.better-auth.com/docs/concepts/database)) is described as adapter-agnostic: "You can add custom fields to your auth config, and the CLI will automatically update the database schema." No MySQL/Drizzle-specific restriction on `additionalFields` type support was found in the docs consulted.

**Number/date/boolean type handling on MySQL** — the only explicit, provider-branching type-conversion code found in the adapter is date coercion, and it is **not** MySQL-specific (applies uniformly across providers):
```typescript
customTransformOutput: ({ data, fieldAttributes }) => {
  if (fieldAttributes.type === "date") {
    if (data === null || data === undefined) {
      return data;
    }
    return new Date(data);
  }
  return data;
},
```
No boolean-to-tinyint or number-specific conversion branch was found in `drizzle-adapter.ts` or `query-builders.ts` — boolean/number handling for MySQL is delegated entirely to Drizzle ORM's own MySQL column types (e.g. `boolean()` in `drizzle-orm/mysql-core`, which itself maps to `tinyint(1)` and handles JS boolean coercion at the Drizzle level, per [Drizzle's MySQL column types docs](https://orm.drizzle.team/docs/column-types/mysql)), not something Better-Auth's adapter layer does extra work for. This is stated as "not found" rather than "confirmed absent" — the adapter's own test suite (`drizzle-adapter.test.ts`) was not exhaustively read for this research and could contain MySQL boolean/number edge-case tests not covered by the two files above.

**Case-insensitive query operators** — `query-builders.ts` implements MySQL/SQLite case-insensitive matching via `LOWER()` wrapping (rather than Postgres's native `ILIKE`):
```typescript
sql`LOWER(${column}) LIKE LOWER(${pattern})`      // insensitiveIlike
sql`LOWER(${column}) IN (${sql.join(values.map(v => sql`LOWER(${v})`), sql`, `)})`  // insensitiveInArray
sql`LOWER(${column}) = LOWER(${value})`           // insensitiveEq
```
This is a portability detail, not a functional gap versus Prisma — no behavioral difference vs. the Prisma adapter is documented for this.

---

## Open questions / unverified

- **`schemaName` config option**: the non-version-pinned Drizzle adapter docs page mentions a `schemaName` option for custom Postgres schema namespacing. This field is **not present** in the pinned v1.6.26 `DrizzleAdapterConfig` interface read directly from source. Could not confirm whether it exists under a different name, was added after 1.6.26, or the docs page is simply describing a Postgres-only convention achieved another way. Not relevant to this repo's MySQL/MariaDB setup either way, but flagged as a docs/version mismatch.
- **`generate` default output filename**: the live docs page states the Drizzle generator's default output is `schema.ts`; the pinned v1.6.26 source (`generate.ts`) shows the actual default is `auth-schema.ts`. Treating the source as authoritative for this repo's version, but could not find a CHANGELOG entry confirming exactly when/whether the docs text and the default filename diverged.
- **`drizzle-adapter.test.ts` was not read.** Claims about MySQL boolean/number type handling and transaction edge cases are based only on `drizzle-adapter.ts` and `query-builders.ts`; the test file could contain adapter behavior (e.g. explicit MySQL boolean conversion tests, or documented transaction caveats for specific MySQL drivers like `mysql2` vs PlanetScale) not surfaced by reading the two source files alone.
- **Relations v2** (`@better-auth/drizzle-adapter/relations-v2`) is mentioned in search results/CHANGELOGs as an alternate adapter entry point for Drizzle's newer relational query API, but was not investigated in this research — unclear whether it's relevant/available at 1.6.26 or is a later addition; not needed for this repo unless the target Drizzle schema uses Drizzle's `relations()` API.
- **Exact behavior of `@better-auth/cli generate --adapter` flag** (forcing a mock adapter without a live DB connection) was summarized from a WebFetch extraction of `generate.ts`, not a verbatim quote — treat the flag's existence/purpose as reasonably confident but the exact CLI flag semantics as not independently re-verified against raw source in this pass.
- **PlanetScale/driver-specific transaction limitations**: the `transaction: false` default's JSDoc references databases that "don't support transactions" generically; no source or docs text was found explicitly naming which MySQL-compatible backends (e.g. PlanetScale's older non-transactional driver) this default is designed to accommodate. Do not treat "MySQL doesn't support transactions" as a general MariaDB/MySQL statement — standard MariaDB with `mysql2` does support transactions; this default appears to be a cross-database portability default, not a MySQL-specific limitation.
