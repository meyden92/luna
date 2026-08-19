# Cutover runbook: production MariaDB → PostgreSQL

The operational half of issue #47. Rehearse until this is boring, then execute it.

This is the only document in the epic that touches production. Everything it does
is **copy-out**, never migrate-out: MariaDB is read and left running, so rollback
at every step is a `DATABASE_URL` change back to it.

Prerequisite: the rehearsal in [`db-rehearsal.md`](./db-rehearsal.md) runs clean
twice in a row. If it does not, the migration is not ready, and no amount of care
during the window will fix that.

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
   Take a backup, restore it somewhere disposable, and confirm the row counts.
   An unverified restore is not a backup.

3. **Rehearse the full cutover at least twice** against a copy of production, end
   to end, using the steps below. Two consecutive runs must produce identical row
   counts and a clean smoke test.

## The window

Downtime is minutes — the migrated data is ~5.5 MB (#24). A maintenance window
was accepted precisely so this stays a simple copy rather than a dual-write or
CDC problem.

```sh
# 1. Freeze writes. Nothing may write to MariaDB after this point.
docker compose stop app

# 2. Take the final source dump. This is the rollback artifact, not a formality.
#    Keep it until Postgres has earned trust; it holds cleartext credentials (#27).
mysqldump --single-transaction --routines --triggers lunashare > lunashare-final.sql

# 3. Load it into the scratch MariaDB and transform into production Postgres.
#    DATABASE_URL points at the NEW Postgres; the transform reads MariaDB over
#    REHEARSAL_MARIADB_* and only ever writes to Postgres.
bun run db:push
bun scripts/db/transform.ts

# 4. Verify before letting any traffic near it.
bun run db:verify        # applied schema vs the source DDL
bun run db:verify-data   # row counts, FK integrity, column names, collation
```

Both verifications exit non-zero on any unreconciled difference. **Do not
continue past a non-zero exit.**

```sh
# 5. Ship it.
git checkout main && git merge feat/drizzle-postgres

# 6. Point the application at Postgres and start it.
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

At any step: redeploy the previous image with `DATABASE_URL` pointed back at
MariaDB. That is the whole procedure.

It works because **the source database is never modified**. Nothing is migrated
out of MariaDB, only copied, so it stays authoritative until the new engine has
earned trust. There is nothing to roll back on the Postgres side either — the
fallback is the untouched original, which is a stronger position than depending
on down-migrations that drizzle-kit does not have (#10).

The point of no return is not the cutover itself. It is the moment you decide
Postgres is authoritative and stop being willing to lose the writes made since —
which is a decision, not an event. Make it deliberately.

## Afterwards

**Leave MariaDB running and untouched.** Retain it and `lunashare-final.sql`
until Postgres has run clean for a period the owner decides.

When that period is up, remove them **deliberately**:

- The dump contains **cleartext API token credentials** (#27). It needs
  destroying, not deleting — overwrite or use `shred`, and remove any copies from
  backups and from `.private/`.
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
