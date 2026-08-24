# Database verification

What the database layer proves at runtime, how to run it, and — the part that
matters most — what it deliberately does **not** prove.

Two classes of defect survive a green type check, a clean schema diff and a
passing test suite, and both were the reason for issue #45:

- **Audit coverage.** Prisma's `defineExtension` audited every model implicitly.
  Drizzle has no interception layer, so every audited write is now an explicit
  `writeAuditLog` call inside the query module (#13). A missing call compiles
  fine and produces no error; so does an over-eager one on a model that was
  never meant to be audited.
- **Collation.** MariaDB's `utf8mb4_unicode_ci` matched and sorted
  case-insensitively. Postgres `text` does neither, and the application never
  asked for insensitivity — it inherited it (#23). A case-mismatched row simply
  stops being found, and a list simply comes back in a different order.

## Running it

```sh
export DATABASE_URL='postgresql://lunashare:lunashare@127.0.0.1:5432/lunashare'
bun test src/db/queries/audit-coverage.test.ts
bun test src/db/queries/collation.test.ts
bun run db:audit-coverage    # the static half, no database needed
```

Every test in `src/db/queries/*.test.ts` skips cleanly when `DATABASE_URL` is
unset, so `bun test` still runs for anyone without a database. They import
`../client` lazily because it opens a connection pool at module load, which a
static import would do before `skipIf` had a chance to skip anything.

The suite runs against the **development Postgres holding a copy of the real
production dataset** (4 users, 4,230 files, 24 templates, 92 cached images, 49
snippets, an empty `audit_log` and an empty `task_execution`), not against
fixtures. Fixtures cannot have the awkward historical values real data carries.
Each run creates its own rows under a per-run id, tears all of them down in
`afterAll`, and asserts `audit_log` returns to the exact count it started at.

`audit-coverage.test.ts` prints one `console.error` from the audit layer. That is
deliberate: the savepoint test makes an audit INSERT genuinely fail, and the
audit layer is loud about it on purpose.

## Coverage: `src/db/queries/audit-coverage.test.ts`

Every one of the 24 models in `AUDITED_MODELS` is driven through its real query
function — never by calling `writeAuditLog` directly — and the resulting row is
read back and checked for the expected `model`, `action` and `recordId`.

Some models have no lifecycle of their own and are exercised through their
parent, which the tests say in a comment where it happens:

| Model | Exercised through |
| --- | --- |
| `ModelField` | `createGenerationModel` / `updateGenerationModel` (the field set is replaced wholesale) |
| `EditingModelField` | `createEditingModel` / `updateEditingModel` |
| `TemplateGlobalVariable` | `createTemplate` / `updateTemplate` |
| `FormShareField` | `createFormShare` |

The 14 models in `UNAUDITED_MODELS` are driven too, and asserted to produce
nothing. A catch-all at the end asserts that no audit row written during the run
names an unaudited model at all, so an over-eager port shows up even if no
individual test happened to drive the write that produced it.

Also proven:

- **Writes inside a transaction are audited.** The old implicit mechanism skipped
  them, and five call sites compensated by hand. Composing a query function into
  a caller's `db.transaction` now changes nothing: the audit row is written, and
  it is visible from inside the same transaction before it commits. Rolling the
  transaction back removes the audit row along with the business row. **No
  exception remains.**
- **A failing audit write cannot corrupt the business write.** `writeAuditLog`
  writes on a SAVEPOINT. The test passes a `userId` that violates
  `audit_log_user_id_user_id_fkey`, so the audit INSERT genuinely fails inside
  the caller's transaction, and then asserts three things: the first business
  write survives, it has no audit row, and a *second* write in the same
  transaction still succeeds and is audited. Without the savepoint the aborted
  statement would poison the transaction and take both writes down.
- **`Token.key` never reaches an audit row.** Asserted against a written row —
  its `after` snapshot, and the serialised row as a whole — not by reading
  `REDACTED_FIELDS`. The constant being right is not the same as the row being
  clean, and the Prisma implementation wrote these credentials in cleartext
  (#27).

### Deliberate gaps in audit coverage

These are decisions, not oversights. They live in `DELIBERATE_GAPS` in the test
file as well as here, and the roll-up test fails **in both directions**: if a
model loses coverage without a gap being declared, and if a declared gap becomes
covered without being removed. A stale gap is a comment lying about the code.

| Model | Missing action | Why |
| --- | --- | --- |
| `User` | create | Accounts are created by Better-Auth through its own adapter, which never calls `writeAuditLog`. A login can therefore never produce audit noise. |
| `User` | delete | No hard delete exists. `softDeleteUserAccount` sets `isDeleted`/`banned`, so it is audited as an **update** — which is what the trail should say happened, because the row survives. |
| `FormShare` | delete | Same shape: `softDeleteOwnedFormShare` is an update. |
| `Flow` | delete | Same shape: `deactivateOwnedFlow` is an update. |
| `FormShareField` | update, delete | Fields are immutable once the share is created, and are only removed by the database cascade from `form_share` — which has no hard-delete path either. |
| `TemplateGlobalVariable` | update | A link is replaced, never edited. `updateTemplate` deletes every link and recreates it, so the audit trail is a delete followed by a create. |
| `ModelField`, `EditingModelField` | update | Same replace-not-edit shape as above. |
| `ImagePreset` | update | Presets are delete-and-recreate; the UI exposes no edit. |
| `UserGroupAssignment` | update | An assignment carries no mutable field; membership changes are a create or a delete. |
| `RbacGroup` | delete | Groups are seeded, never removed — no call site deletes one. |
| `DenylistEntry` | update, delete | Entries are append-only; the admin UI offers neither an edit nor a removal. |
| `ModerationCase` | delete | Cases are resolved, never removed. `resolveModerationCase` is an update. |

Three unaudited models have **no writer at all** in any query module, so there is
nothing to drive: `Account`, `Verification` and `OCRResult`. A test asserts that
this list is exactly those three, so a writer appearing for one of them fails the
suite rather than slipping past unverified.

Two more things the audit tests deliberately leave alone:

- `purgeCachedImages` (`admin.ts`) is never called. It truncates `cached_image`,
  including the 92 migrated production rows. `deleteCachedImages(ids)` is used
  for the unaudited-delete assertion instead.
- Scheduler bookkeeping on `task` (`setTaskNextExecutionAt`,
  `setTaskLastExecutionAt`, `incrementTaskRetryCount`, `resetTaskRetryCount`) is
  intentionally unaudited even though `Task` is an audited model. Auditing is
  split by intent, not by table, so "every write to `task` produces an audit row"
  is **false by design** and is not asserted.

## Collation: `src/db/queries/collation.test.ts`

Every site is asserted on the **write path and the read path**. Normalising one
side alone is a half-fix that #23 proved does nothing, so each test also checks
that the naive form (`eq` against the raw column) finds nothing — that is what
stops the `ilike`/`lower()` being "simplified" back later.

Covered here:

- **Email lookup.** `normaliseEmail` lower-cases on write; the admin search finds
  the account whatever case is typed; a plain `eq` on the upper-cased value finds
  nothing.
- **API token lookup.** A key created in upper case is stored lower case, and
  `validateTokenKey` still authenticates when the client presents it upper case.
- **The stored rows themselves.** `user.email`, `token.key`, `file.sha256`,
  `file.md5`, `file.phash` and `denylist_entry.hash` are asserted to hold no
  value that differs from its own `lower()`. This is the half a write-path fix
  cannot reach: history has to be normalised too, and this checks the real
  dataset rather than a fixture.
- **Search filters** across files (`listGallery`), users (`listAdminUsersPage`),
  the audit trail (`listAuditLogs`, on both `model` and `action`, which hold
  PascalCase and lower-case vocabularies respectively) and tasks
  (`getTaskByName`, `listTaskExecutions` by status and by free text).
- **`lower()`-based ordering** of human-entered names, in `listActiveUsers` and
  `listAdminUsersPage`. The fixture pair is chosen so byte-order and
  `lower()`-order disagree: byte-wise `B` (0x42) sorts before `a` (0x61), so a
  raw `ORDER BY name` reverses them. A separate test asserts that raw ordering
  *is* byte-wise, so the two ordering tests cannot pass vacuously — if the
  deployment's collation ever changes, that test fails and the `lower()` keys can
  be reconsidered.
- **LIKE metacharacters in user input.** A literal `%` or `_` typed into a gallery
  search, an admin user search or a task-name lookup is compared as text. Each
  test pairs the literal row with a decoy that only an unescaped pattern would
  match. This covers all three escaping helpers: `containsPattern` in `files.ts`
  and the `escapeLike` in `admin.ts` and in `tasks.ts`.

Cross-referenced, not duplicated:

| Site | Where it is proven |
| --- | --- |
| The denylist hash gate, write path and read path — the fail-open regression | `moderation.test.ts` |
| The quarantined-status comparison used by the rescan | `moderation.test.ts` |
| Upload hashes normalised on write | `uploads.test.ts` |
| The CDN `image/` prefix and the audio player's content-type list | `delivery.test.ts` |
| The global-variable name uniqueness check | `ai.test.ts` |

### Composite-index usage

The gallery listing is the heaviest query in the application, and a translation
can preserve results while quietly losing the access path. The test captures the
SQL Drizzle actually emits from `listGallery` — by intercepting the query
builder's own thenable, so the plan is the plan of the real query and not of a
copy that can drift — and runs `EXPLAIN (ANALYZE)` on it against the real data.

Page one, for the owner holding 4,184 of the 4,230 files:

```
Limit
  ->  Nested Loop Left Join
        ->  Nested Loop Left Join
              ->  Index Scan Backward using "file_ownerId_isDeleted_createdAt_id_idx" on file
                    Index Cond: ((owner_id = '208496133343936512') AND (is_deleted = false))
              ->  Index Scan using file_metadata_file_id_key on file_metadata
        ->  Memoize  ->  Index Scan using folder_pkey on folder
```

Page two, with the keyset cursor:

```
              ->  Index Scan Backward using "file_ownerId_isDeleted_createdAt_id_idx" on file
                    Index Cond: ((owner_id = '208496133343936512') AND (is_deleted = false)
                                 AND (ROW(created_at, id) < ROW((InitPlan 1).col1, '4477d2cc-…')))
```

The cursor comparison lands **inside** the index condition rather than being
filtered after the scan. That is the thing worth pinning: Prisma's offset-style
`cursor` + `skip: 1` could not do it, and a version that degraded into a growing
scan would return identical results with no failing test.

With a folder filter, the query moves to the folder-qualified index:

```
              ->  Index Scan Backward using "file_ownerId_isDeleted_folderId_createdAt_id_idx" on file
                    Index Cond: ((owner_id = …) AND (is_deleted = false) AND (folder_id = …))
```

No `Sort` node appears in any of the three; the ordering comes from the index.

The folder plan is measured against the fullest real folder (1,000 files) on
purpose. Against an empty or invented folder id the planner legitimately prefers
the narrower `file_folderId_idx`, and asserting on that would be measuring the
fixture rather than the access path.

## Deliberately not covered

- **The perceptual-hash half of the moderation gate.** It is a Hamming-distance
  scan over paged reads, so it has no collation surface. Only the exact `sha256`
  and `md5` halves do, and those are covered.
- **Hash-shaped columns nothing compares across a case boundary**:
  `ocr_result.fileHash`, `cached_image.hash`, `file_rendition.paramHash` and
  `view_event.visitorHash`. Each is written and read in one canonical case by
  the code that produces it, so the value never crosses a case boundary.
  `view_event.visitorHash` in particular is only ever produced by
  `createHmac(...).digest('hex')` on both sides, so no case boundary exists.
- **Fixed vocabularies with no case boundary**: `rbac_group.key`, `user.role`,
  `cached_image.purpose`, `audit_log.recordId`. Each holds either
  application-generated ids or literals chosen by the code, never user input, and
  each is compared exactly on purpose.
- **Better-Auth's own writes** to `user`, `session`, `account` and `verification`.
  They go through its adapter, which never touches `writeAuditLog`. This is
  asserted indirectly — no audit row for the sessions dropped by
  `softDeleteUserAccount` — but the adapter's internal behaviour is the library's
  contract, not ours.
- **Concurrency.** Nothing here exercises two writers racing: not
  `ensureSystemGroup`'s `onConflictDoNothing` loser path, not `claimFormShareView`'s
  row lock, not the storage-quota admission check. Those are single-run tests
  against a single connection.
- **Audit trail history.** Production's pre-cutover `audit_log` was deliberately
  never carried across (#24). The table started empty and fills from the first
  audited write onwards, so there is no historical audit data to verify.
- **Plan stability over time.** The `EXPLAIN` assertions are a snapshot against
  the current statistics of the current dataset. They will catch a query that
  loses its index; they will not catch a plan that degrades only at a data volume
  this database does not yet hold.

## Rehearsing the username/password cutover (#54)

The Discord cutover migration deletes Account rows, nulls every Avatar and
empties `session` in the same step that adds the Username columns. It runs
exactly once, so a permanent test would guard nothing after the day it runs.
What guards it is a rehearsal against the development database — the one holding
the copy of the real production dataset described above — before it is run for
real.

Take a snapshot of what must survive, run the migration, then prove nothing was
lost. The one assertion the whole change rests on is the last: no User lost a
file.

```sh
export DATABASE_URL='postgresql://lunashare:lunashare@127.0.0.1:5432/lunashare'

# 1. Before: owners and their file counts.
psql "$DATABASE_URL" -c \
  'SELECT u.id, count(f.id) AS files FROM "user" u LEFT JOIN file f ON f.owner_id = u.id GROUP BY u.id ORDER BY u.id' \
  > /tmp/before.txt

# 2. Run it.
bun run db:migrate

# 3. After: the same query must produce byte-identical output.
psql "$DATABASE_URL" -c \
  'SELECT u.id, count(f.id) AS files FROM "user" u LEFT JOIN file f ON f.owner_id = u.id GROUP BY u.id ORDER BY u.id' \
  > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt   # must be empty

# 4. The cutover's own post-state. All three must be zero.
psql "$DATABASE_URL" -c "SELECT count(*) FROM account WHERE provider_id = 'discord'"
psql "$DATABASE_URL" -c 'SELECT count(*) FROM "session"'
psql "$DATABASE_URL" -c 'SELECT count(*) FROM "user" WHERE image IS NOT NULL'
```

Then verify the way back in, which is the other half of the cutover and the part
no migration can prove:

```sh
bun run auth:set-credentials <your-email>
```

Sign in with what it set.

The container applies pending migrations before the server starts, so a deploy
carries its own schema change and the cutover is **deploy → set credentials →
sign in**:

```sh
docker compose exec -it app bun run auth:set-credentials <your-email>
```

A migration that fails stops the container rather than serving queries against a
schema that cannot answer them. To start without migrating — a bad migration
caught in production, say — override the entrypoint:

```sh
docker compose run --entrypoint bun app .output/server/index.mjs
```

`user.id` is what everything hangs off; the Discord identifier lived only in
`account.account_id` and was read by no application code. `file.owner_id` is
`ON DELETE RESTRICT`, so Postgres refuses to remove an owner who holds files —
step 3 is confirming the migration never tried, not hoping it did not.
