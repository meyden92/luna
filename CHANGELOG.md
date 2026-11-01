# Changelog

Every LunaShare release, newest first. Versions up to v4.7.0 were copied from their GitHub releases, or from the tag message where no release exists.

## v4.7.0 (2026-11-01)

The admin panel now shows which version is running and whether a newer release exists.

### Highlights

- **Version card on the admin start page** (`/admin`): shows the running release and commit, plus the latest release on GitHub with a link to its notes. An "Update available" badge appears when a newer release exists.
- **No token needed:** the check uses GitHub's public API, and the result is cached for 6 hours. If GitHub can't be reached, the card says so instead of claiming you are up to date.

### Fixed

- **Build time:** `BUILD_TIME` in the image (and in `/api/health`) now holds when the image was built. It used to hold when the repository was last updated.

### Upgrade

No migration and no new environment variables. Images from this release onward carry their version. Older images show `dev`.

## v4.6.0 (2026-10-31)

Images now show inline in Discord, and files can be renamed and retagged from the Preview again.

### Highlights

- **Inline images in Discord:** share links of public JPG, PNG, GIF and WebP files now end in their extension (`/view/<id>.jpg`). Pasted into Discord, they show only the image, with no link-preview card. Browsers still get the normal share page, and old links without an extension keep working. Videos and private files keep the card. Discord caches embeds per URL, so paste a fresh link to see the change.
- **Rename and retag from the Preview:** the Preview panel has Name and Tags fields above Folder. The name saves on Enter or when the field loses focus, Esc cancels, and an empty name is put back. Each tag saves as it is added or removed. The card's ⋯ menu has a new **Rename** item that opens the Preview with the name selected. The old, unreachable edit dialog is gone.

### Fixed

- **Fewer dropped connections:** the server now sends `Keep-Alive: timeout=5`, so clients that reuse connections close them before the server does. Browsers ignore the header, and proxies drop it.

### Test suite

- Concurrent e2e runs no longer tear down each other's stacks, and a second run in the same checkout is refused with a hint to use a worktree.
- Fixed flaky specs: the embed iframe, the Admin-group revoke, and the gallery setup's ShareX rate-limit pacing.
- The index-plan tests in `collation.test.ts` no longer depend on how many rows the dev database holds.

### Upgrade

No migrations and no new environment variables.

The v4.6.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #200 (for #58), #196 (for #101) and #213 (for #123, #192, #195, #197, #199, #211, #212).

## v4.5.1 (2026-10-20)

Bugfix for the Downloader.

### Fixed

- **Saved videos play everywhere again.** When Instagram's best stream was VP9, the saved MP4 played as audio only in QuickTime Player and other Apple players. LunaShare now re-encodes those videos to H.264 with ffmpeg and keeps the full resolution. Videos that are already H.264 are untouched. The conversion shows in the progress bar, and Remove and the timeout stop it like any other step.

### Upgrade

No migrations and no new environment variables. Downloads prepared before the upgrade stay VP9, so download them again after deploying.

The v4.5.1 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Fixed in #210, for #209.

## v4.5.0 (2026-10-20)

Adds the **Downloader**, an admin-only tool for saving videos from Instagram posts to your device. Paste a reel, video post or carousel link, and LunaShare prepares every video in it as an MP4. Nothing is stored as one of your files.

### Highlights

- **Downloader** (`/tools/download`, in the Tools menu, admins only): reels, single-video posts and carousels, with photos skipped. Each video is saved as `<account>_<shortcode>.mp4` (`_<n>` for carousels) and can be saved as soon as it's ready, with an inline preview.
- **Best quality:** the highest available resolution wins, and H.264/AAC is preferred at equal resolution.
- **Lifecycle:** Downloads keep running when you leave the page. Two prepare at a time and the rest queue. Pasting the same post again leads to the existing Download. A Download expires an hour after it's ready, and preparation stops after 10 minutes. Videos over 500 MB are rejected.
- **Errors** name the cause: needs a login, not found or private, no videos, too large, rate-limited, or unrecognised (yt-dlp may be out of date). The raw yt-dlp output sits behind *Details*.
- **Sources admin page** (`/admin/sources`): set, replace or clear the Instagram Source session (`cookies.txt`). It is stored encrypted, never shown back and audited without its value. The page also shows the installed yt-dlp version and its last update.
- **Self-updating yt-dlp:** the image ships ffmpeg and a pinned, checksum-verified yt-dlp (`2026.08.19`). A new "Update yt-dlp" task runs daily at 04:00 and once after every boot, and Tasks → Run now updates it on demand.

### Upgrade

**This release needs a database migration.** Run `bun run db:migrate` when you deploy:

- `20261020151753_parched_nocturne` creates the `source_session` table.

No new environment variables: Source sessions use the existing `FORM_FIELD_ENCRYPTION_KEY`.

For local development, install the tools with `brew install yt-dlp ffmpeg`.

The v4.5.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #208, for epic #201 and its sub-issues #202–#207.

## v4.4.0 (2026-09-24)

The logged-in app is rebuilt around one job: find a file, then copy the image or its link. It uses the new Utility look: neutral greys, no serif font in the app, tighter corners, and mint only as the accent.

### Highlights

- **Navigation:** the top bar is 56px, the active page is marked by a sliding pill, and pages change with a view transition. Upload is available from every page, and `/` focuses search.
- **Files:** a folder sidebar that appears only on Files, with "All files" and "Not in a folder" as separate views. Files are grouped by date, a selection bar handles bulk actions, and the file count now matches the sidebar.
- **Preview:** an image stage with a 340px side panel, a filmstrip that keeps loading as you scroll, and a morph transition from the gallery.
- **Upload sheet:** the nav button, dropping files on the window and pasting all use the same upload flow. Files uploaded as "Only me" are never public, not even briefly.
- **Generate:** Create, Edit an image, Templates and History tabs. Saved presets, reusing reference images you've uploaded before, "Clear history" and a model picker on Edit all carry over.
- **Snippets and Automations:** a list beside an editor. Snippets save automatically, and Automations use a step-by-step builder with a one-sentence summary.
- **Settings:** Profile, Uploads & ShareX, and Storage. Storage shows your real quota and usage, and Profile has Bio, Description and the marketing-email preference.
- Typing in search no longer re-renders the whole gallery.

### Removed

- The lightbox, the virtualised gallery, Select mode, the density popover, the date scrubber, the floating upload button, the collapsible sidebar rail, the AI workspace sidebar, the node canvas (`@xyflow/react`) and the old settings routes.
- Per-user usage statistics, and the view and egress event logging that only fed them. Admin egress totals remain.

### Upgrade

**This release needs database migrations.** Run `bun run db:migrate` when you deploy:

- `20260924155448_windy_jazinda` drops `user.show_all_files_includes_foldered`.
- `20260924222312_drop_usage_analytics` drops `view_event`, `view_daily_rollup` and `egress_event`, merges `egress_rollup` into one row per owner per month (totals are unchanged), and removes the `prune-raw-analytics` task.

The `ANALYTICS_SALT` environment variable is no longer used and can be removed.

The v4.4.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #92 and #95, completing epic #80 and its sub-issues, plus #57, #93 and #94.

## v4.3.0 (2026-09-04)

LunaShare now uses a single visual system across the app, with more readable dark mode, responsive workspaces and a cleaner admin interface.

### Highlights

- Replaced Tailwind and its related tooling with co-located, typed CSS Modules, cascade layers and one semantic Design token scale.
- Kept light, dark and system Appearance, including the navigation toggle and persisted first paint; removed the named colour-theme selector.
- Improved supporting-text contrast, card surfaces and heading consistency.
- Restyled admin destinations as neutral cards with aligned content; narrow screens use a scrollable navigation strip above the content.
- Made AI settings and results respond to available panel width using container queries, with stacked scrolling on smaller screens.
- Balanced the landing feature grid and refined popup motion, reduced-motion handling and native scrollbar styling.
- Added CSS declaration-freshness validation so missing or stale generated types fail typechecking.

### Validation and known limitations

Quality CI, TypeScript, lint and the production build passed. Eight targeted Playwright navigation, Appearance, landing and AI-page tests passed, with additional desktop/mobile and popup checks in both Appearances. The migration's earlier full Playwright run reported 25 failures also reproduced on the previous main branch; these are documented in #78 and are not claimed fixed in this release.

### Upgrade

The named colour themes are removed; light/dark/system Appearance remains. No database migration is required for this styling release.

The v4.3.0 tag triggers the GHCR image build and publication of the versioned and latest tags. Deployment remains manual.

Implemented in #78, completing epic #64 and its 11 sub-issues.

## v4.2.1 (2026-08-25)

Hotfix for a regression in v4.2.0. Upgrade immediately if you are running v4.2.0.

### The regression

v4.2.0 shipped a `--preload` that raised `Bun.serve`'s request idle timeout from its 10-second default to 120 seconds for every response. Deployed, it made every client-side route switch spin forever, while a full browser refresh still rendered instantly.

### Why

The hang was already present. A server function returns a stream that never closes. Bun used to reap that socket after 10 seconds, the client's reader threw, and the router carried on — which is exactly the

```
Error reading query stream: TypeError: Cannot read properties of undefined (reading 'mutations')
```

that had been in the console since well before v4.2.0. That error was the timeout doing its job.

Holding the socket for 120 seconds did not repair the stream. It removed what was bounding it, turning a 10-second stall into an unbounded one.

Origin SSR responses stayed fast throughout (TTFB 0.13–0.23s, complete under 0.25s), which ruled out database pressure and the newly scheduled reconciler, and isolated the fault to the `_serverFn` path a route switch uses and a refresh does not.

### The fix

The preload is reverted and Bun's 10-second default restored, returning the server to its v4.1.2 behaviour.

Everything else from v4.2.0 is untouched and still in place: the SSE keepalive that keeps template generations alive, the explicit cancel endpoint, the reconciler, the disconnect policy, and the RustFS metadata fix. The keepalive emits every 3 seconds, comfortably inside the restored 10-second window.

### Known issue

The never-closing server-function stream is still there — it is a pre-existing bug that v4.2.0 merely exposed, tracked in #62. Until it is dealt with, Bun's 10-second idle timeout is load-bearing and must not be raised again.

### Deploying

Tagging builds and pushes the GHCR image but does not deploy it — deployment is still manual.

## v4.2.0 (2026-08-25)

Template generations no longer die mid-run, and the server no longer destroys the work behind a dropped connection.

### The bug

A template generation died at ~10 seconds. The response dropped, the server read that as a cancellation, and both Replicate predictions were cancelled mid-run — so the run was paid for and the cards showed "network error".

It looked like a network fault for a long time. It wasn't. **`Bun.serve` was killing its own response.** Production runs Nitro's bun preset, whose bootstrap calls `serve()` with no `idleTimeout`, so Bun's 10-second default applied and dropped any response whose socket went quiet for that long:

```
[Bun.serve]: request timed out after 10 seconds. Pass `idleTimeout` to configure.
```

A generation sends nothing between creating the predictions and the first one settling. `bun run dev` is Vite's Node server and has no such timeout, which is why it never reproduced locally.

### What changed

**Streams stay alive.** The SSE writer emits a keepalive comment every 3 seconds, so a polling generation's connection never goes idle. Measured against Bun 1.3.14: the default is a true idle timer that writes reset, and a 3s keepalive survived 45 seconds of otherwise doing nothing.

**The idle timeout is raised for everything else.** That 10-second default governed *every* response, not just the streaming ones. The image now preloads a wrapper supplying a 120-second default, since the preset exposes no way to configure it.

**A dropped connection no longer destroys the work.** A transport drop and a user pressing Cancel reach the server as the same closed request, so the template route no longer cancels predictions on either — it leaves the rows for the reconciler, and deliberate cancellation goes through a new endpoint instead. `image` and `edit-image` keep the old behaviour, since their rows record no prediction id and nothing could finish them.

**The reconciler actually runs now.** `checkTemplateGenerations` had an executor registered but was never scheduled, so it had never executed once. It is seeded on a 5-minute cron, and it now also closes out generations whose stream died before recording a prediction id.

**Reference-image uploads work on RustFS.** The cache upload was the only S3 write sending object metadata, and RustFS mis-canonicalises an `x-amz-meta-*` header name containing an underscore when verifying SigV4 — so every template and edit-image generation failed instantly with `SignatureDoesNotMatch` in dev. Both values were already recorded elsewhere and nothing read them, so the metadata is gone. Real S3 and R2 were unaffected.

**Smaller fixes.** The status message no longer freezes mid-generation; a generation can no longer move backwards out of a terminal status; a dropped stream refreshes template history, since the work behind it now survives.

### Deploying

Tagging builds and pushes the GHCR image but does not deploy it — deployment is still manual.

Full detail in #59 and #60.

## v4.1.2 (2026-08-24)

Slimmer image, faster builds, and better-auth upgraded to 1.7.1. Replaces the unreleased v4.1.1.

- **Image roughly halved**: the runtime image no longer ships dev tooling or stale pre-Drizzle dependencies (~361MB → ~190MB compressed).
- **Tag builds finish in ~2 minutes** instead of 7+ (GitHub Actions layer-cache export removed), and the deploy-webhook job is gone — a tag only builds and publishes; deploying stays manual.
- **better-auth 1.6.26 → 1.7.1**: accounts are now keyed by `(issuer, accountId)`. A migration adds the `issuer` column and backfills existing rows automatically on first boot.

### Deploying

Pull the image and start it — the `issuer` migration runs automatically before the server accepts requests. Verified against a database created under v4.1.0: existing username/password accounts keep working, no manual steps.

### Rollback note

The new migration is backward-compatible in the schema sense (it only adds a column and an index), so rolling back the image to v4.1.0 after this migration ran is fine.

## v4.1.1 (2026-08-24)

Patch bump: no behaviour change in the app itself.

The image drops the dev tooling and the stale pre-Drizzle lockfile
leftovers (~361MB -> ~188MB compressed), the tag build no longer
exports the GHA layer cache, and the deploy-webhook job is gone —
a tag now only builds and publishes.

## v4.1.0 (2026-08-24)

The container applies pending migrations before the server starts. A deploy now carries its own schema change, so the code and the database can no longer drift apart — which is what made v4.0.0 fail with `column "username" does not exist`.

### Deploying

```bash
# 1. deploy — migrations run automatically on start, then:
docker compose exec -it app bun run auth:set-credentials <your-email>
```

Then sign in at `/login`. Coming from a version before 4.0.0, take a database backup first: the username/password cutover deletes the Discord accounts, clears every avatar and empties the session table, and it is irreversible. No user row is removed and nothing anyone owns is touched.

### If a migration fails

The container stops rather than serving queries against a schema that cannot answer them, and the error is in `docker compose logs app`. To start without migrating, override the entrypoint:

```bash
docker compose run --entrypoint bun app .output/server/index.mjs
```

There is no configuration flag for this — Docker's own override is the escape hatch.

### Verified

Against the built image and a throwaway Postgres: an empty database receives the full schema, a second boot is a no-op, an unreachable database exits non-zero without ever starting the server, the server then answers `/login` with 200, and `auth:set-credentials` still works through `docker exec`, which does not pass through the entrypoint.

## v4.0.1 (2026-08-24)

Packaging fix for v4.0.0. No behaviour change.

The v4.0.0 image could not run its own migrations: `drizzle/` and `drizzle.config.ts` were never copied into the runtime stage. Nothing applies migrations automatically — not the image, not compose, not CI — so a deployed v4.0.0 instance served the new code against the old schema and failed on the first query for a column it expected:

```
error: column "username" does not exist
```

### Deploying

The order matters, and the middle step is the one v4.0.0 made impossible:

```bash
# 1. deploy v4.0.1, then:
docker compose exec app bun run db:migrate
docker compose exec -it app bun run auth:set-credentials <your-email>
```

Then sign in at `/login`.

The migration is **irreversible** — it deletes the Discord accounts, clears every avatar and empties the session table. Take a database backup first. No user row is removed and nothing anyone owns is touched.

### If you already deployed v4.0.0

You are not stuck. Either deploy v4.0.1 and follow the steps above, or run the migration from a checkout that can reach the database:

```bash
DATABASE_URL='<production url>' bun run db:migrate
```

## v4.0.0 (2026-08-24)

LunaShare authenticates its own users. Discord OAuth is gone, replaced by a username and a password held by this instance and dependent on nothing outside it.

### Breaking

Deploying this runs a migration that **cannot be undone**. It deletes the Discord accounts, clears every avatar and empties the session table. Everyone is signed out, and **nobody can sign in until credentials are set for them out of band**.

`DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are no longer read. Remove them from the deployment's environment.

No user is deleted and nothing anyone owns is touched: files, folders, API tokens, group memberships and quotas all hang off the internal user id, never off the Discord identifier. The database enforces this independently — `file.owner_id` is `ON DELETE RESTRICT`, so Postgres refuses to remove an owner who holds files.

### First sign-in after deploying

There is no way into the app until a password exists, so the first one is set from a shell in the container:

```
docker compose exec -it app bun run auth:set-credentials <your-email>
```

It asks for a username and a password, and does not echo the password. Then sign in at `/login`.

This script is not cutover scaffolding — it ships in the image permanently. LunaShare sends no email, so there is no reset link, and this is the only recovery for a locked-out administrator.

### What's new

- Username and password sign-in, matched case-insensitively
- Self-service profile: avatar, username, display name, password
- Avatar uploads are re-encoded to square 512 WebP, which bounds their size and strips EXIF, GPS included
- Administrators can create users and reset passwords from the admin panel
- No public registration — accounts are created by an administrator or by the script
- Sign-in failures never reveal whether the username exists
- Rate limiting on the sign-in path (production only)

### Fixed along the way

- The login form lost what you typed if you submitted before the page hydrated
- Signing in from a deep link returned you to the dashboard instead of where you were headed
- Newly created users showed as "Pending" in the admin panel forever

### Known gap

The sign-in rate limiter is enabled in production only: its window is keyed on IP and path, and every request in the end-to-end suite shares one address. It is the one behaviour here with no automated coverage.

## v3.0.1 (2026-08-22)

Housekeeping release. No behaviour change and no deployment-contract change — upgrading from v3.0.0 needs nothing but the new image.

### Retired the MariaDB migration harness (#50, #51)

Production has run on PostgreSQL since the cutover, so the migration tooling stopped being a rollback path and became dead weight. The pre-cutover dump it needed to run has been destroyed — it held the old `audit_log` rows, which stored API keys and OAuth tokens in cleartext — so the harness could no longer run at all.

Removed the transform and its supporting modules, both migration verifiers, the `db:rehearse` / `db:verify` / `db:verify-data` scripts, the `mariadb` devDependency, the scratch MariaDB service in the dev compose file, and the two cutover runbooks. 1,205 lines.

Kept `db:audit-coverage` and the database-backed suites: those prove ongoing invariants — every audited model has an explicit `writeAuditLog` call, and the collation-sensitive lookups stay case-folded — not that a migration landed.

`README.md`, `tests/e2e/README.md` and `.env.sample` still described a Prisma + MariaDB stack, down to a `mysql://` connection string in the self-hosting example. They now describe the PostgreSQL baseline.

### Dependency cleanup (#52, #53)

Dropped three packages nothing imported: `h3-v2` (a duplicate of Nitro's own transitive `h3`, at a different version), `@tanstack/zod-adapter`, and `server-only` (a Next.js idiom TanStack Start does not use).

Updated 18 packages to their newest in-range versions, including the AWS SDK trio, the TanStack suite, Vite, Biome and `lucide-react`. No range in `package.json` moved.

`better-auth` and `motion` were deliberately left alone — the first wants its own branch and a sign-in smoke test, the second is a major outside its range.

## v3.0.0 (2026-08-20)

Replaces Prisma + MariaDB with Drizzle ORM 1.0 on PostgreSQL 18 across the
whole application, Better-Auth included. Epic #29 (18 tickets, #30-#47).

BREAKING: requires PostgreSQL 18 and a postgresql:// DATABASE_URL.
MariaDB is no longer supported. Application behaviour is unchanged.

- 38 models declared in Drizzle, snake_case columns, camelCase properties
- Audited writes on savepoints; Token.key redacted from audit rows (#27)
- Case-insensitive matching made explicit where MariaDB's collation
  provided it implicitly (#23)
- Production data migrated via scripts/db/transform.ts, verified against
  the source by row count, FK integrity, column names and collation

## v2.11.1 (2026-08-16)

No release notes were written for this version.

## v2.11.0 (2026-08-05)

Bun toolchain and runtime, runtime-resolved deployment URLs, and the
GitHub Actions pipeline replacing the GitLab one.
