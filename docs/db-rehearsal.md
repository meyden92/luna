# Migration rehearsal: MariaDB → PostgreSQL

How to run the data migration end to end against a copy of production, from
cold. Rehearsing this until it is boring is what makes the cutover in #47 a
routine operation rather than an event.

Nothing here touches production. The scratch MariaDB is loaded *from* a dump and
copied *out of*; the real MariaDB is never written to and stays authoritative
until Postgres has earned trust (#24).

## What you need

- Docker.
- `.private/lunashare-dump.sql` — the production dump. This is the **final**
  one: production is closed and the source data is frozen, so there is no newer
  dump coming and no second one to take at cutover. A rehearsal therefore runs
  against the exact bytes destined for production. Gitignored, and it contains
  cleartext credentials (#27), so it is destroyed rather than deleted when it is
  no longer needed.
- `.private/source-ddl.sql` — the `CREATE TABLE` blocks extracted from that
  dump. Both the schema verification and the transform read it as the
  authoritative description of the source.

Regenerate the DDL extract only if the dump is ever replaced — it should not be,
now that the source is frozen:

```sh
awk '/^CREATE TABLE/,/ENGINE=/' .private/lunashare-dump.sql > .private/source-ddl.sql
```

## Run it

```sh
docker compose -f docker-compose.dev.yml up -d --wait

# Once, and again whenever the dump is replaced. The dump is Navicat format,
# not mysqldump — anything assuming mysqldump structure will not parse it.
docker exec lunashare-mariadb-scratch sh -c \
  'mariadb -uroot -plunashare lunashare < /dump/lunashare-dump.sql'

bun run db:rehearse
```

`db:rehearse` chains four steps, each of which also runs on its own:

| Step | Script | What it proves |
|---|---|---|
| `db:push` | drizzle-kit | The Drizzle schema applies to Postgres |
| — | `scripts/db/transform.ts` | Rows copy across, parent-first, through the Drizzle schema |
| `db:verify` | `scripts/db/verify-schema.ts` | The applied schema matches the **source DDL** |
| `db:verify-data` | `scripts/db/verify-data.ts` | Row counts, FK integrity, column names and collation |

Both verifications exit non-zero on any unreconciled difference.

The rehearsal is idempotent: the transform truncates its target tables first, so
it repeats from a known state with no manual cleanup. Two consecutive runs
producing identical output is the bar #32 sets, and the bar #47 re-uses.

Start from a completely clean slate with `docker compose -f
docker-compose.dev.yml down -v`, which drops both volumes — you will need to
reload the dump afterwards.

## Why it is built this way

**The schema is diffed against the source, not against itself.** The reference
slice proved a schema can round-trip perfectly through `drizzle-kit pull` while
being wrong in every column name. Introspection only confirms that Postgres
stored what it was asked for.

**Rows are written through the Drizzle schema, not by a converter.** `pgloader`
and friends infer target types, and the type decisions here were made
deliberately in #23 and #28. Writing through the schema makes the target types
enforce themselves: a value that does not fit fails loudly at insert rather than
landing silently in a wrong column. At ~5.5 MB there is no throughput argument
for a converter.

**Column names are checked, not just row counts.** A count-based check passes a
schema that is wrong in every name. `scripts/db/verify-schema.ts` was tested by
renaming one column back to camelCase in the development database: the counts
stayed identical and the diff still caught it.

**Case normalisation happens to historical rows, not only to new writes.**
MariaDB's `utf8mb4_unicode_ci` matched case-insensitively; Postgres `text` does
not. Normalising only the read path is a silent half-fix that passes review and
does nothing (#23). `scripts/db/transform-tables.ts` lists every normalised
column with its reason, and the verification derives its checks from that same
list so the two cannot drift.

## What does not migrate

Three tables, each a recorded decision (#24) — see `EXCLUDED_FROM_TRANSFER` in
`scripts/db/transform-tables.ts` for the reasons. `audit_log` still exists in the
new schema and fills from the first audited write; only its history is left
behind.
