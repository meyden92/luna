# Changelog

Every LunaShare release, newest first. Entries up to v4.7.0 were rewritten from their GitHub releases, or from the tag message where no release exists.

## v4.7.0 (2026-11-01)

**Are We There Yet?**

LunaShare now knows which version it is, and it will tell you when a newer one is out. No more checking GitHub at 2am to find out whether you're behind.

### ✨ New

🏷️ **A name tag for your instance.** The admin start page (`/admin`) has a version card showing the running release and commit, next to the latest release on GitHub with a link to its notes. When something newer exists, an "Update available" badge says so, politely but firmly.

🔓 **No token, no fuss.** The check uses GitHub's public API and caches the answer for 6 hours. If GitHub can't be reached, the card says exactly that instead of pretending you're up to date.

### 🐛 Fixed

⏰ **Build time means build time.** `BUILD_TIME` in the image (and in `/api/health`) now holds when the image was built, not when the repository was last touched.

### ⬆️ Upgrade

No migration and no new environment variables. Images from this release onward carry their version. Older images show `dev`.

## v4.6.0 (2026-10-31)

**The One Where Discord Stops Framing Our Images**

You paste a picture into Discord, Discord shows you the picture. Revolutionary, we know. Also, files can be renamed again, so `IMG_4821.png` can finally become something with dignity.

### ✨ New

🖼️ **Pictures, not postcards.** Share links for public JPG, PNG, GIF and WebP files now end in their extension (`/view/<id>.jpg`), so Discord shows just the image instead of a link-preview card wrapped around it. Browsers still get the normal share page and old links keep working. Videos and private files keep the card. Discord remembers every URL it has seen, so paste a fresh link to see the difference.

✏️ **Name it, tag it, move on.** The Preview has Name and Tags fields above Folder. Enter or clicking away saves the name, Esc means never mind, and an empty name quietly puts the old one back. Tags save the moment you add or remove them. The ⋯ menu on a card got a **Rename** item that drops you right into the name field. The old edit dialog that nobody could reach anyway is gone.

### 🐛 Fixed

🔌 **No more talking to a hung-up phone.** The server now sends `Keep-Alive: timeout=5`, so clients close idle connections before we do instead of sending requests into the void. Browsers ignore the header and proxies drop it, so nobody else notices.

### 🧪 Under the hood

- Parallel e2e runs stopped tearing down each other's stacks, and a second run in the same checkout is turned away with a hint to use a worktree.
- The embed iframe and Admin-group revoke specs got their nerves fixed, and the gallery setup paces its ShareX uploads properly.
- The index-plan tests in `collation.test.ts` no longer care how many rows your dev database holds.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.6.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #200 (for #58), #196 (for #101) and #213 (for #123, #192, #195, #197, #199, #211, #212).

## v4.5.1 (2026-10-20)

**Video Killed the Podcast Star**

A tiny patch for a sneaky Apple problem: some downloaded videos came out as podcasts.

### 🐛 Fixed

🍎 **Videos play on Apple devices again.** When Instagram's best stream was VP9, the saved MP4 played as audio only in QuickTime Player and friends. LunaShare now re-encodes those videos to H.264 with ffmpeg, at full resolution. Videos that are already H.264 are left alone. The conversion shows up in the progress bar, and Remove and the timeout stop it like any other step.

### ⬆️ Upgrade

No migrations and no new environment variables. Downloads prepared before the upgrade stay VP9, so download them again after deploying.

The v4.5.1 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Fixed in #210, for #209.

## v4.5.0 (2026-10-20)

**Reel Talk**

Meet the **Downloader**: paste an Instagram link and walk away with every video in it as an MP4. Admins only, and nothing ends up in your files.

### ✨ New

📥 **The Downloader** lives at `/tools/download` in the Tools menu. It handles reels, single-video posts and carousels, and skips photos. Each video is named `<account>_<shortcode>.mp4` (with `_<n>` for carousels), comes with an inline preview, and can be saved the moment it's ready.

💎 **Only the good stuff.** The highest resolution wins, and at equal resolution H.264/AAC beats the rest.

⏳ **It keeps going without you.** Downloads keep running when you leave the page. Two prepare at a time and the rest wait their turn. Paste the same post twice and you land on the existing Download. A Download expires an hour after it's ready, preparation gives up after 10 minutes, and videos over 500 MB are turned away at the door.

🚨 **Errors that actually say something:** needs a login, not found or private, no videos, too large, rate-limited, or unrecognised (yt-dlp may be out of date). The raw yt-dlp output hides behind *Details* for the curious.

🍪 **Sources page** (`/admin/sources`): set, replace or clear the Instagram session (`cookies.txt`). It's stored encrypted, never shown back, and audited without its value. The page also shows the installed yt-dlp version and when it last updated.

🔄 **yt-dlp updates itself.** The image ships ffmpeg and a pinned, checksum-verified yt-dlp (`2026.08.19`). A new "Update yt-dlp" task runs daily at 04:00 and after every boot, and Tasks → Run now does it on demand.

### ⬆️ Upgrade

**This release needs a database migration.** Run `bun run db:migrate` when you deploy:

- `20261020151753_parched_nocturne` creates the `source_session` table.

No new environment variables: Source sessions use the existing `FORM_FIELD_ENCRYPTION_KEY`.

For local development, install the tools with `brew install yt-dlp ffmpeg`.

The v4.5.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #208, for epic #201 and its sub-issues #202–#207.

## v4.4.0 (2026-09-24)

**Marie Kondo Was Here**

We rebuilt the logged-in app around the one thing you actually do: find a file, then copy the image or its link. Everything else had to justify itself, and a lot of it couldn't. The new Utility look: neutral greys, no serif font in the app, tighter corners, and mint only as the accent.

### ✨ New

🧭 **A top bar that gets out of the way.** It's 56px tall, a sliding pill marks where you are, and pages change with a view transition. Upload works from every page, and `/` jumps to search.

📁 **Files, organised.** A folder sidebar shows up only on Files, with "All files" and "Not in a folder" as separate views. Files are grouped by date, a selection bar handles bulk actions, and the file count finally agrees with the sidebar.

🔍 **A Preview worth looking at.** An image stage with a 340px side panel, a filmstrip that keeps loading as you scroll, and a morph transition from the gallery.

📤 **One way to upload.** The nav button, dropping files on the window and pasting all use the same upload sheet. Files uploaded as "Only me" are never public, not even for a split second.

🎨 **Generate, tidied up.** Create, Edit an image, Templates and History tabs. Saved presets, reusing earlier reference images, "Clear history" and the model picker on Edit all made the move.

✂️ **Snippets and Automations** are a list beside an editor. Snippets save on their own, and Automations get a step-by-step builder that sums each one up in a sentence.

⚙️ **Settings in three rooms:** Profile, Uploads & ShareX, and Storage. Storage shows your real quota and usage, and Profile has Bio, Description and the marketing-email preference.

### 🔧 Improved

⌨️ Typing in search no longer re-renders the whole gallery with every keystroke.

### 🗑️ Removed

Thank you for your service: the lightbox, the virtualised gallery, Select mode, the density popover, the date scrubber, the floating upload button, the collapsible sidebar rail, the AI workspace sidebar, the node canvas (`@xyflow/react`) and the old settings routes. Per-user usage statistics are gone too, along with the view and egress logging that only existed to feed them. Admin egress totals stay.

### ⬆️ Upgrade

**This release needs database migrations.** Run `bun run db:migrate` when you deploy:

- `20260924155448_windy_jazinda` drops `user.show_all_files_includes_foldered`.
- `20260924222312_drop_usage_analytics` drops `view_event`, `view_daily_rollup` and `egress_event`, merges `egress_rollup` into one row per owner per month (totals are unchanged), and removes the `prune-raw-analytics` task.

The `ANALYTICS_SALT` environment variable is no longer used and can be removed.

The v4.4.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #92 and #95, completing epic #80 and its sub-issues, plus #57, #93 and #94.

## v4.3.0 (2026-09-04)

**Fifty Shades of Grey (Tokens)**

One look across the whole app. Dark mode you can actually read, workspaces that fit your screen, and an admin area that stopped looking like a spreadsheet.

### ✨ New

🌗 **Light, dark or system, still your call.** The Appearance toggle in the navigation stays, and the first paint still remembers your choice. The named colour themes didn't make the cut.

### 🔧 Improved

👓 **Easier on the eyes.** Supporting text has better contrast, cards have proper surfaces, and headings finally agree with each other.

🛠️ **Admin, but tidy.** Admin pages are neutral cards with aligned content. On narrow screens the navigation becomes a scrollable strip above the content.

📐 **AI pages that fit.** AI settings and results adapt to the panel width they actually get, and stack and scroll on small screens.

✨ **The little things.** A balanced feature grid on the landing page, smoother popups, better reduced-motion handling and native scrollbars.

### 🧪 Under the hood

- Tailwind is out. Typed, co-located CSS Modules, cascade layers and one semantic design-token scale are in.
- Missing or stale generated CSS types now fail typechecking.
- 25 Playwright failures from the full run also happen on the previous main. They're tracked in #78 and not claimed fixed here.

### ⬆️ Upgrade

The named colour themes are removed. Light, dark and system Appearance remain. No database migration is required.

The v4.3.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #78, completing epic #64 and its 11 sub-issues.

## v4.2.1 (2026-08-25)

**Turns Out the Timeout Was Load-Bearing**

Hotfix for v4.2.0. If you're running v4.2.0, upgrade now.

### 🐛 Fixed

🌀 **Page switches stop spinning forever.** v4.2.0 raised Bun's request idle timeout from 10 to 120 seconds for every response. Result: every client-side route switch hung, while a full refresh rendered instantly. The cause was older than v4.2.0. A server function returns a stream that never closes, and Bun used to kill that socket after 10 seconds, which let the router carry on. That's where the `Error reading query stream` in the console came from: the timeout was quietly doing its job. Raising it turned a 10-second stall into an endless one. The preload is reverted and Bun's 10-second default is back.

Everything else from v4.2.0 stays: the SSE keepalive (every 3 seconds, well inside the window), the cancel endpoint, the reconciler, the disconnect policy and the RustFS fix.

### ⚠️ Known issue

The stream that never closes is still around, tracked in #62. Until it's fixed, Bun's 10-second idle timeout is load-bearing. Don't raise it again.

### ⬆️ Upgrade

The tag builds and pushes the GHCR image but does not deploy it. Deployment is still manual.

## v4.2.0 (2026-08-25)

**It Was Bun All Along**

Template generations stop dying at the 10-second mark, and a dropped connection no longer throws away work you already paid for.

### 🐛 Fixed

🕵️ **Case closed.** A template generation used to die after about 10 seconds. The response dropped, the server read that as a cancel, and both Replicate predictions were cancelled mid-run: paid for, and rewarded with "network error". It looked like a network fault for ages. It was `Bun.serve` killing its own response: the bun preset starts the server without an `idleTimeout`, so any response that went quiet for 10 seconds got dropped. `bun run dev` runs on Vite's Node server, which is why it never happened locally.

💓 **Streams keep a pulse.** The SSE writer sends a keepalive every 3 seconds, so a generation's connection never goes idle. Tested against Bun 1.3.14: a 3s keepalive survived 45 seconds of nothing.

⏱️ **More patience for everything else.** The image preloads a wrapper that raises the default idle timeout to 120 seconds for every response.

💸 **A dropped connection keeps your work.** The template route no longer cancels predictions when the connection drops. The reconciler finishes them, and a real Cancel goes through a new endpoint. `image` and `edit-image` keep the old behaviour, since there's no prediction id to finish them with.

🧹 **The reconciler finally clocks in.** `checkTemplateGenerations` was registered but never scheduled, so it had never run once. It now runs every 5 minutes and also closes out generations whose stream died before saving a prediction id.

🪣 **Reference-image uploads work on RustFS.** RustFS mangled an `x-amz-meta-*` header with an underscore while checking the signature, so every template and edit-image generation failed instantly with `SignatureDoesNotMatch` in dev. Nobody read that metadata anyway, so it's gone. Real S3 and R2 were never affected.

🔧 **And a few more:** the status message no longer freezes mid-generation, a generation can't go back once it's finished, and a dropped stream refreshes template history.

### ⬆️ Upgrade

The tag builds and pushes the GHCR image but does not deploy it. Deployment is still manual.

Full detail in #59 and #60.

## v4.1.2 (2026-08-24)

**Lost Some Weight**

A slimmer image, faster builds and a better-auth upgrade. This replaces the unreleased v4.1.1.

### 🔧 Improved

🏋️ **The image is about half the size.** No more dev tooling or stale pre-Drizzle dependencies in the runtime image: ~361MB → ~190MB compressed.

🏎️ **Tag builds in about 2 minutes** instead of 7+, now that the GitHub Actions layer-cache export is gone. So is the deploy-webhook job: a tag only builds and publishes.

🔐 **better-auth 1.6.26 → 1.7.1.** Accounts are now keyed by `(issuer, accountId)`. A migration adds the `issuer` column and fills in existing rows on first boot.

### ⬆️ Upgrade

Pull the image and start it. The `issuer` migration runs on its own before the server takes requests. Tested against a database created under v4.1.0: existing username/password accounts keep working, with no manual steps.

Rolling back to v4.1.0 after the migration ran is fine. It only adds a column and an index.

Deployment is still manual.

## v4.1.1 (2026-08-24)

**The Dress Rehearsal**

Never released on GitHub, and replaced by v4.1.2. No behaviour change in the app.

### 🔧 Improved

🧳 The image leaves the dev tooling and the stale pre-Drizzle lockfile leftovers at home (~361MB → ~188MB compressed), tag builds no longer export the GHA layer cache, and the deploy-webhook job is gone. A tag now only builds and publishes.

## v4.1.0 (2026-08-24)

**Migrations Included, Batteries Too**

The container now runs pending migrations before the server starts. Every deploy brings its own schema changes, so code and database can't drift apart anymore. That drift is exactly what made v4.0.0 fail with `column "username" does not exist`.

### ✨ New

🚀 **Migrate on boot.** Start the container and the migrations run first. If one fails, the container stops instead of serving queries against a schema that can't answer them, and the error waits for you in `docker compose logs app`.

### 🧪 Under the hood

Tested against the built image and a throwaway Postgres: an empty database gets the full schema, a second boot does nothing, an unreachable database exits non-zero without starting the server, `/login` answers 200, and `auth:set-credentials` still works through `docker exec`, which skips the entrypoint.

### ⬆️ Upgrade

```bash
# 1. deploy — migrations run automatically on start, then:
docker compose exec -it app bun run auth:set-credentials <your-email>
```

Then sign in at `/login`. Coming from a version before 4.0.0, take a database backup first: the username/password cutover deletes the Discord accounts, clears every avatar and empties the session table, and it is irreversible. No user row is removed and nothing anyone owns is touched.

If a migration fails and you need to start without migrating, override the entrypoint:

```bash
docker compose run --entrypoint bun app .output/server/index.mjs
```

There is no configuration flag for this. Docker's own override is the escape hatch.

## v4.0.1 (2026-08-24)

**Forgot to Pack the Migrations**

A packaging fix for v4.0.0. No behaviour change.

### 🐛 Fixed

🧳 **The migrations made it into the suitcase.** The v4.0.0 image left `drizzle/` and `drizzle.config.ts` out of the runtime stage, so it couldn't run its own migrations. Nothing else ran them either, so a deployed v4.0.0 served new code against the old schema and fell over on the first query:

```
error: column "username" does not exist
```

### ⬆️ Upgrade

The order matters, and the middle step is the one v4.0.0 made impossible:

```bash
# 1. deploy v4.0.1, then:
docker compose exec app bun run db:migrate
docker compose exec -it app bun run auth:set-credentials <your-email>
```

Then sign in at `/login`.

The migration is **irreversible**: it deletes the Discord accounts, clears every avatar and empties the session table. Take a database backup first. No user row is removed and nothing anyone owns is touched.

Already deployed v4.0.0? You're not stuck. Deploy v4.0.1 and follow the steps above, or run the migration from a checkout that can reach the database:

```bash
DATABASE_URL='<production url>' bun run db:migrate
```

## v4.0.0 (2026-08-24)

**Breaking Up With Discord (Login Only, We're Still Friends)**

LunaShare now signs in its own users. Discord OAuth is gone, replaced by a username and password that live on your instance and depend on nobody else.

### ✨ New

🔑 **Username and password sign-in**, with usernames matched case-insensitively.

🙋 **Your profile, your rules:** avatar, username, display name and password, all self-service. Avatars are re-encoded to a square 512px WebP, which keeps them small and strips EXIF, GPS included.

🛡️ **Admins hold the keys.** Administrators create users and reset passwords from the admin panel. There's no public registration: accounts come from an admin or from the script.

🤐 **Poker face.** A failed sign-in never reveals whether the username exists, and the sign-in path is rate-limited in production.

### 🐛 Fixed

- The login form no longer forgets what you typed if you submit before the page has loaded.
- Signing in from a deep link takes you where you were going, not to the dashboard.
- New users no longer show as "Pending" in the admin panel forever.

### ⚠️ Known gap

The sign-in rate limiter runs in production only, because it's keyed on IP and path and the whole e2e suite shares one address. It's the one behaviour here with no automated test.

### ⬆️ Upgrade

**Breaking.** Deploying this runs a migration that **cannot be undone**. It deletes the Discord accounts, clears every avatar and empties the session table. Everyone is signed out, and **nobody can sign in until credentials are set for them out of band**.

`DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are no longer read. Remove them from the deployment's environment.

No user is deleted and nothing anyone owns is touched: files, folders, API tokens, group memberships and quotas all hang off the internal user id, never off the Discord identifier. The database enforces this too: `file.owner_id` is `ON DELETE RESTRICT`, so Postgres refuses to remove an owner who holds files.

There is no way in until a password exists, so set the first one from a shell in the container:

```
docker compose exec -it app bun run auth:set-credentials <your-email>
```

It asks for a username and a password and does not echo the password. Then sign in at `/login`.

The script ships in the image for good. LunaShare sends no email, so there is no reset link, and this is the only way back in for a locked-out administrator.

## v3.0.1 (2026-08-22)

**Spring Cleaning in August**

Pure housekeeping: no behaviour change, and upgrading from v3.0.0 needs nothing but the new image.

### 🧪 Under the hood

🪦 **Goodbye, MariaDB migration harness** (#50, #51). Production has run on PostgreSQL since the cutover, so the migration tooling was dead weight. The pre-cutover dump it needed is destroyed, since its old `audit_log` rows held API keys and OAuth tokens in cleartext. Out went the transform and its modules, both verifiers, the `db:rehearse` / `db:verify` / `db:verify-data` scripts, the `mariadb` devDependency, the scratch MariaDB service in the dev compose file and both cutover runbooks: 1,205 lines. `db:audit-coverage` and the database-backed suites stay, because they guard rules that still matter.

📚 **The docs caught up.** `README.md`, `tests/e2e/README.md` and `.env.sample` still described Prisma + MariaDB, right down to a `mysql://` connection string. They now describe PostgreSQL.

📦 **Dependency diet** (#52, #53). Three packages nothing imported are gone: `h3-v2`, `@tanstack/zod-adapter` and `server-only`. 18 packages moved to their newest in-range versions, including the AWS SDK trio, the TanStack suite, Vite, Biome and `lucide-react`. `better-auth` and `motion` were left alone on purpose: the first wants its own branch and a sign-in smoke test, the second is a major outside its range.

### ⬆️ Upgrade

Nothing to do beyond pulling the new image.

## v3.0.0 (2026-08-20)

**New Database, Who Dis?**

Prisma + MariaDB are out. Drizzle ORM 1.0 on PostgreSQL 18 is in, across the whole app, Better-Auth included. You won't notice a thing, which was the point. Epic #29 (18 tickets, #30–#47).

### 🧪 Under the hood

- 38 models declared in Drizzle: snake_case columns, camelCase properties.
- Audited writes run on savepoints, and `Token.key` is redacted from audit rows (#27).
- Case-insensitive matching is now explicit wherever MariaDB's collation used to do it quietly (#23).
- Production data was migrated with `scripts/db/transform.ts` and checked against the source by row count, FK integrity, column names and collation.

### ⬆️ Upgrade

**Breaking:** requires PostgreSQL 18 and a `postgresql://` `DATABASE_URL`. MariaDB is no longer supported. App behaviour is unchanged.

## v2.11.1 (2026-08-16)

**The Quiet One**

No release notes were written for this version. It knows what it did.

## v2.11.0 (2026-08-05)

**Moving Day**

A new toolchain, a new runtime and a new pipeline, all in one go.

### 🧪 Under the hood

- 🥟 Bun is now the toolchain and the runtime.
- 🌐 Deployment URLs are resolved at runtime.
- 🐙 A GitHub Actions pipeline replaces the GitLab one.
