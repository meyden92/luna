# Cutover runbook: production MariaDB → PostgreSQL

The operational half of issue #47.

**Production is already closed and the source data is frozen.**
`.private/lunashare-dump.sql` is the final production dump — there is nothing
left to freeze and no second dump to take. That removes the maintenance window
entirely: this is no longer a timed cutover, it is a migration of a fixed dataset
followed by a deploy, done at whatever pace you like.

It also means the rehearsal is not a stand-in. It runs against the exact bytes
that are going to production, so a clean rehearsal is the migration having
already succeeded once.

Everything here is **copy-out**, never migrate-out: the dump is read and the
MariaDB instance is left alone, so rollback stays a `DATABASE_URL` change back
to it.

Prerequisite: the rehearsal in [`db-rehearsal.md`](./db-rehearsal.md) runs clean
twice in a row. If it does not, the migration is not ready.

## Before the window

1. **Provision the production PostgreSQL instance.** Record where it lives, who
   operates it, and how it is reached, in this section — a runbook that assumes
   you remember is not a runbook.

   - Version 18, to match what the schema was verified against.
   - `TimeZone = UTC`. The whole type mapping assumes it (#23); a different
     server zone shifts every timestamp with no error.
   - Reachable only from the application host.

   | | |
   |---|---|
   | Host | _record it here_ |
   | Operator | _record it here_ |
   | Backup schedule | _record it here_ |

2. **Verify backup AND restore on the new engine before anything depends on it.**
   Take a backup of the new Postgres, restore it somewhere disposable, and
   confirm the row counts. An unverified restore is not a backup. This is about
   protecting the data once it is *on* Postgres — the source is already safe,
   because it is a frozen file.

3. **Rehearse twice**, end to end, using the steps below. Two consecutive runs
   must produce identical row counts and a clean smoke test. Because the dump is
   final, a rehearsal is byte-for-byte what production will get.

## The migration

No window, no freeze, no downtime to manage: the source stopped changing before
this started. The migrated data is ~5.5 MB (#24) and a full run takes minutes.

```sh
# 1. Load the final dump into the scratch MariaDB. Already done if you have
#    rehearsed; it is the same file.
docker compose -f docker-compose.dev.yml up -d --wait mariadb
docker exec lunashare-mariadb-scratch sh -c \
  'mariadb -uroot -plunashare lunashare < /dump/lunashare-dump.sql'

# 2. Create the schema, then transform into production Postgres. DATABASE_URL
#    points at the NEW Postgres; the transform reads MariaDB over
#    REHEARSAL_MARIADB_* and only ever writes to Postgres. It truncates its
#    target tables first, so re-running is safe.
#
#    db:migrate applies the versioned migrations in ./drizzle and records what it
#    applied. Use it here, NOT db:push -- push diffs the live schema and is for
#    the disposable dev database only.
bun run db:migrate
bun scripts/db/transform.ts

# 3. Verify before letting any traffic near it.
bun run db:verify        # applied schema vs the source DDL
bun run db:verify-data   # row counts, FK integrity, column names, collation
```

Both verifications exit non-zero on any unreconciled difference. **Do not
continue past a non-zero exit.**

```sh
# 4. Ship it.
git checkout main && git merge feat/drizzle-postgres

# 5. Point the application at Postgres and start it.
#    DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/lunashare
docker compose up -d app
```

### Smoke test

Manual, in this order, because each depends on the one before:

- [ ] Sign in
- [ ] List files (the gallery, including a search and a folder filter)
- [ ] Open a file
- [ ] Upload a file
- [ ] Exercise an AI tool

## Rollback

At any step: redeploy the previous image — the last one built with Prisma — with
`DATABASE_URL` pointed back at MariaDB. That is the whole procedure.

**This has not been rehearsed, and cannot be from here.** It is sound *by
construction* rather than by demonstration: the source is never written to, so
there is nothing to undo. But executing it needs a deploy, so treat "rollback
works" as an argument you have checked rather than a result you have seen. If
you want it demonstrated, the cheap version is to redeploy the previous image
against MariaDB once, before cutting over, and confirm the app still serves.

It works because **the source is never modified** — and here it is not even
live, it is a frozen dump plus a retired instance. There is nothing to roll back
on the Postgres side either: the fallback is the untouched original, which is a
stronger position than depending on down-migrations that drizzle-kit does not
have (#10).

Because production was closed before the migration began, there is no window in
which writes could be lost, and so no point of no return to judge. Postgres
becomes authoritative when the first write lands on it after the deploy.

## Afterwards

**Leave the MariaDB instance alone.** Retain it and
`.private/lunashare-dump.sql` until Postgres has run clean for a period you
decide. The dump is the more important of the two now: it is the complete,
final state of production in a single file.

When that period is up, remove them **deliberately**:

- The dump contains **cleartext API token credentials** (#27). It needs
  destroying, not deleting — overwrite or use `shred`, and remove any copies from
  backups and from `.private/`. Do not skip this because the file is gitignored;
  gitignored is not the same as gone.
- The historical `audit_log` rows are not migrated (#24) and exist only in the
  dump and the retired instance. Destroying them is intended: that is where the
  cleartext credentials live.

## Deployment configuration

`docker-compose.yml` passes `DATABASE_URL` straight through, so the cutover is a
change to the deployment `.env`, not to the compose file:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/lunashare
```

The MariaDB service and the Prisma generation stage disappear from the image in
#46, which also removes the dummy build-time `DATABASE_URL` that existed only so
`prisma generate` could run.
