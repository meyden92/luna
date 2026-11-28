# Changelog

Every LunaShare release, newest first. Entries up to v4.7.0 were rewritten from their GitHub releases, or from the tag message where no release exists.

## v4.9.1 (2026-11-28)

**The One Where the Template Gets a New Engine and Keeps Its Interior**

Long Templates were a scroll workout: edit a prompt at the bottom, scroll all the way up to check a Variable, scroll back down, repeat. And once a Template was saved, its Model was set in stone. This release fixes both, so you can finally swap a Template onto a newer endpoint without rebuilding it from scratch.

### 🔧 Improved

📌 **The sidebar sticks around.** In the Template editor (**Admin → Studio → Templates**), the Variables and Preview column now stays in view below the nav while you scroll through the Field cards. If it's taller than your window it scrolls on its own, and it stops above the Save bar. On screens narrower than 1280 px the columns still stack.

🔁 **New Model, same Template.** The Model dropdown works on saved Templates too. Switching keeps every Field card whose input the new Model also has, prompt and `{variables}` included. Inputs the new Model adds get their defaults, and inputs it lacks disappear along with any user upload that fed them. Anything that no longer fits the new schema gets flagged on its card and blocks Save until you fix it. The same goes for new Templates, where switching the Model used to wipe everything. Heads-up: Templates aren't versioned, so **Run again** on an older Generation runs its Variable values against the Template's current Model.

### 🧪 Under the hood

Unit tests for the Model switch, and `admin/studio/templates.spec.ts` now covers switching the Model and the sticky sidebar.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.9.1 tag triggers the GHCR image build, publishes the versioned and latest tags and deploys to Coolify.

Implemented in #317 (for #315).

## v4.9.0 (2026-11-27)

**The One Where the Secrets Move Out of the .env and Into a Safe**

Your `.env` used to be a junk drawer: S3 keys, fal keys, signing secrets, proxy settings, all loose next to each other. Now they live in the Vault, encrypted in the database and changed from the admin area without a restart. While we were tidying up, storage paths and upload limits stopped being hardcoded constants and became settings you can actually click.

### ✨ New

🔐 **A Vault for the stuff you'd rather not paste around.** **Settings → Vault** holds the S3 connection (`AWS_ENDPOINT`, `AWS_REGION`, `AWS_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`), `CDN_URL`, `FAL_KEY`, `FAL_BILLING_KEY`, `RENDITION_SIGNING_SECRET`, `DELIVERY_COOKIE_SECRET`, `TRUSTED_PROXY_HOPS` and `PROXY_ALLOWED_DOMAINS`. Entries are encrypted with a key derived from `FORM_FIELD_ENCRYPTION_KEY` and apply at once: set `FAL_KEY` and the Studio switches on, no restart. Secrets are write-only, so once saved you never see them again, and setting or clearing an entry asks for your password (10 tries per 15 minutes). An environment variable with the same name still wins, so you can fill the Vault first and drop the env variables one at a time. Lose `FORM_FIELD_ENCRYPTION_KEY` and every Vault entry has to be set again, so back it up somewhere that isn't the server.

🚧 **Boots without storage, and tells you so.** The app now starts even before S3 is configured. A banner across the admin area points at the Vault until every Storage entry is set; uploads answer with a 503 meanwhile instead of crashing the place.

🗂️ **Your bucket, your folder structure.** **Settings → Storage** sets where Renditions, Studio Outputs, Template previews, Template reference images and Avatars land, as key templates with variables like `{userId}` or `{uuid}` and a live example key under each field. A changed path applies to new objects only; existing ones keep their key and keep working.

📏 **Limits you can turn without a deploy.** **Settings → Limits** holds the default storage quota for new Users, the Avatar and ShareX upload limits, ShareX upload concurrency, the download proxy and Downloader size limits, how many downloads a User may prepare at once, when prepared downloads expire, and the duplicate-detection threshold. **Settings → Studio** gained how long Outputs live, and the size limits for inputs, Template previews and Template reference images. Without any changes every value equals what was hardcoded before.

### 🔧 Improved

💬 **Field cards that explain themselves.** Every Field card in the Template editor shows fal's description of the input under its name, in every mode, so a fixed `safety_tolerance: 1` no longer leaves you guessing what that 1 means.

📐 **Aspect ratios you can see.** Options like `16:9`, `9:16`, `2.39:1`, `square_hd` or `portrait_4_3` get a little frame in their actual shape, in the Studio form and the admin value editors. Rename the option to "Breit" and the frame stays 16:9.

🏷️ **Call it what it is.** "Add file input" on the Variables card is now **Add user upload**, with a hint that images every run should send belong on the Field card as reference images.

### 🧪 Under the hood

A `v*` tag now deploys `latest` to Coolify through its webhook once the image is built. Yes, this is the first release where that happens; fingers crossed.
Issue labels move by themselves: a PR with `Part of #N` sets the issue to `testing`, and closing it as completed clears the status labels.
The agent docs only point at skills that actually exist.
New unit tests for the Vault, field encryption and storage paths, plus E2E specs `admin/vault.spec.ts` and `admin/platform-settings.spec.ts`.

### ⬆️ Upgrade

**This release needs database migrations.** The image's entrypoint applies them on start. Elsewhere, run `bun run db:migrate` when you deploy:

- `20261127141712_platform_settings` creates the `platform_settings` table and adds `output_lifetime_days`, `input_max_mib`, `template_preview_max_mib` and `template_reference_max_mib` to `studio_settings`, with defaults equal to the previous constants.
- `20261127145728_vault_entry` creates the `vault_entry` table.

Environment:
- Required in env from now on: `DATABASE_URL`, `FORM_FIELD_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; `PUBLIC_BASE_URL` stays optional.
- `AWS_ENDPOINT`, `AWS_REGION`, `AWS_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `CDN_URL`, `FAL_KEY`, `FAL_BILLING_KEY`, `RENDITION_SIGNING_SECRET`, `DELIVERY_COOKIE_SECRET`, `TRUSTED_PROXY_HOPS` and `PROXY_ALLOWED_DOMAINS` move to Settings → Vault. If they stay in env, env wins and nothing changes. To move them, store each one in the Vault, then remove it from env.
- The bundled `docker-compose.yml` no longer passes the moved variables. A deployment that uses it as-is starts without storage until the Vault is filled.
- Remove `MAX_SHAREX_UPLOAD_BYTES` and `SHAREX_UPLOAD_CONCURRENCY`; they are no longer read. Set them under Settings → Limits; until then the defaults apply (90 MiB, 2).

The v4.9.0 tag triggers the GHCR image build, publishes the versioned and latest tags and deploys to Coolify.

Implemented in #307 (for #292, #293, #294, #295, #296), #300 (for #284, #285, #286, #287), #291 (for #278, #288, #289, #290), #298 (for #297), #304 (for #303) and #302 (for #301).

## v4.8.7 (2026-11-26)

**The One Where Templates Bring Their Own Photos**

Some Templates need a picture to work from: a style, a pose, a layout. Until now your Users had to bring that picture themselves, every single time. Now the Template brings it along, your Users add their own photo next to it, and you decide who goes first. Your option labels also got room to breathe, and the Studio admin pages finally share one roof.

### ✨ New

🖼️ **Templates with a picture in their pocket.** In the Template editor, switch a file input such as `image_urls` to **Fixed value** and it turns into numbered slots. **Add reference image** uploads an image the Template sends with every Generation, and **Add user upload** adds a slot your Users fill in the Studio. Drag the slots (or use the keyboard) into the order your prompt expects, because "image 1" means slot 1. Reference images must be images, they stay private to the Template, and they are deleted when you remove them or delete the Template.

🏠 **One Studio door instead of four.** The admin area shows a single **Studio** entry. It leads to `/admin/studio`, where Categories, Models, Templates and Overview sit as tiles with live numbers: how many there are, how many are inactive, this month's spend and the Generations running right now. Studio settings stay under **Settings → Studio**.

### 🔧 Improved

📏 **Say it in more than 120 characters.** Labels of Variables, choice options and Fields can now be up to 500 characters long, so descriptive options no longer bounce off the save button.

📜 **Long options, no squeeze.** When an option label runs longer than 40 characters, the Studio form shows that choice as a vertical list that wraps the text, instead of chips or a dropdown that cut it off. Short options keep their chips.

### 🧪 Under the hood

A new e2e spec, `admin/studio/template-references.spec.ts`, builds a Template with a reference image and a User slot, reorders them and checks the order fal receives. The hub got its own test, and unit tests cover slot order, the reference image rules and the long-label list.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.8.7 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #281 (for #276, #277, #278, #279).

## v4.8.6 (2026-11-25)

**The One Where 3000 Cards Stopped Holding the Browser Hostage**

You scroll all the way down a big library, pick a few files, move them, pick a few more, and a click on a checkbox used to take its sweet time (up to half a minute on a few thousand files). Your browser was busy keeping every loaded card ready to animate, including the ones a mile above your head. We told it to relax about the cards nobody can see.

### 🐛 Fixed

🐌 **Clicks that click.** With thousands of files loaded in Files, selecting a card, opening **Move to**, moving files and hovering no longer stall. The browser now skips drawing cards that are off screen, so the work stays the size of one screenful however far you scroll: about 300 layers instead of 22,000 at 3125 files, and a checkbox click is back to roughly a tenth of a second. Cards look exactly as before, hover lift and shadow included. Small catch: in Safari the top 2 px of a hovered card's lift are clipped.

### 🧪 Under the hood

`content-visibility: auto` on the card wrappers in `FileGroups.module.css`, and the gallery view transition no longer measures cards the browser skipped, since measuring one would draw it.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.8.6 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #274 (for #273).

## v4.8.5 (2026-11-25)

**The One Where the Preview Stopped Falling Apart Mid-Goodbye**

You open a file in the Preview, hit **Delete file**, and for half a second the cards behind it climbed right over the Preview like it owed them money. We told them to stay in the back. One fix, one release, zero drama.

### 🐛 Fixed

🫥 **Cards stay behind the curtain.** Deleting a file from the open Preview no longer lets the gallery cards behind it paint over the backdrop, the info panel and the filmstrip until the delete has gone through. The Preview stays intact and moves straight on to the next file. Deleting from a card's ⋯ menu or the selection bar still glides the remaining cards into place.

### 🧪 Under the hood

Two new specs in `tests/e2e/files/gallery-transition.spec.ts` check that a delete from the gallery runs the gallery transition and a delete from the Preview does not.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.8.5 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #271 (for #270).

## v4.8.4 (2026-11-25)

**The One Where Deleting a Screenshot Stopped Taking a Coffee Break**

You scroll through a few hundred files, delete one, and the whole page used to freeze for seconds while the browser filmed every card goodbye. Not anymore. You can now also sort out a batch of images right in the Preview, and the numbers in the sidebar finally keep up with you.

### ✨ New

🔍 **Cull from the Preview.** Every card has an **Open preview** button in its top-right corner (on hover), and it works while files are selected, so you can look at a picture full size before you pick it. In the Preview, the round button at the top left of the stage or the **X** key adds or removes the open file from the selection. The counter shows "· N selected" and the filmstrip marks selected files with a check. **Esc** closes the Preview and keeps your selection, so the selection bar can delete the whole batch.

⚙️ **Admin → Settings.** A new **Settings** entry in the admin menu groups the adjustable bits as tiles. **Sync excluded paths** lets you choose which S3 keys the sync analysis ignores (`*` matches anything: `templates/*`, `*.tmp`, `*/edit-image/*`). The three paths that used to be hard-coded are pre-filled and can be removed. Adding and removing a pattern is audited. The Studio settings moved here too: `/admin/settings/studio`, and the old `/admin/studio/settings` is gone.

### 🔧 Improved

🗑️ **Delete, then keep going.** Deleting the file on the Preview stage shows the next one (or the previous one at the end of the list) instead of closing the Preview. Deleted cards disappear as soon as you confirm, without waiting for the server. If the server refuses, they come back, still selected, with an error toast.

🧹 **"Remove photo location" is gone.** The switch under **Settings → Uploads & ShareX** and the stripping on ShareX and web uploads are removed. Uploads keep their metadata as uploaded. The metadata inspection report on each upload stays.

### 🐛 Fixed

🧊 **No more freeze on delete.** Deleting files, sorting, switching the layout or uploading froze Files for seconds once a lot of cards were loaded (about 5 s at 900 cards, over 30 s at 2000), because the animation captured every loaded card. Only the cards on screen animate now, so the cost stays the same however far you scroll.

🔢 **Totals that keep up.** After a delete, a move or an upload, the head count ("N files"), **All files**, **Not in a folder**, the folder counts and the storage meter stayed at their old values until a reload. They update right away now.

🎬 **Videos play, sounds sound.** The Files Preview plays video (muted, looping) and audio (with controls) again instead of showing an icon. Cards without a picture show the file name. ← → on a focused player seeks instead of switching files.

### 🧪 Under the hood

`bun run db:seed` gives a local dev database an `admin`/`admin` and a `user`/`user` account, each with the 125-file e2e gallery, and refuses anything that is not localhost. Sign-in works under the Node dev server again (`/api/auth/*` answered 500 there). Bulk file changes (delete, move, folder delete, admin restore and delete) write their audit rows in one insert under one `changeSet`, so they show as one action in the admin trail. A Studio test stopped believing it was forever November 20. New specs cover the bounded animation, the optimistic delete, culling in the Preview, the totals and sync excluded paths. The separate `video/` Remotion project is ignored by git, Docker, Biome and tsc, and some outdated agent docs were cleared out.

### ⬆️ Upgrade

**This release needs database migrations.** The image's entrypoint applies them on start. Elsewhere, run `bun run db:migrate` when you deploy:

- `20261122011202_token_drop_strip_metadata` drops the `token.strip_metadata` column. It only held the removed "Remove photo location" setting.
- `20261125092429_sync_excluded_path` creates the `sync_excluded_path` table and seeds `cache/*`, `templates/*` and `*/edit-image/*`, so the sync analysis ignores the same paths as before.

No new environment variables. Bookmarks to `/admin/studio/settings` now land on the 404 page; the page lives at `/admin/settings/studio`.

The v4.8.4 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #255 (for #251, #252, #253, #254), #258 (for #257), #262 (for #261), #259 (for #256) and #268 (for #260, #264).

## v4.8.3 (2026-11-06)

**The One Where the Content Checker Said No and We Finally Listened**

fal has been rejecting some of your Generations for minutes while Studio kept showing "Queued" like nothing happened. That's fixed. Also, the operator account can find the Admin panel without typing the URL from memory, and the Studio stops putting Templates and Models in one pile.

### 🔧 Improved

🗂️ **Models in one place, Templates in another.** In **Studio**, each Category's Models now sit in one **Model** dropdown with their price. Templates get their own **Templates** section with their picture cards. Ten models in a Category is now one dropdown, not ten cards.

✍️ **A Template editor you can read.** The three options per Field are now called **User input**, **Fixed value** and **fal default**, each with one line saying what it does. Save and Delete moved into a bar at the bottom of the window, so you stop scrolling back to the top after every change. The bar also tells you why Save is greyed out.

### 🐛 Fixed

🚫 **Rejected means Failed.** When fal's content checker rejected a request, Studio showed the Generation as **Queued** forever, and Cancel only produced an error toast. fal reports this rejection only on the result URL, and we didn't count that as a final answer. Now the Generation turns **Failed** with fal's message ("…flagged by a content checker") within one poll, and Cancel ends the same way, without the toast.

📎 **One file input, asked for once.** A Template file field set to **User input** showed its file input twice in the Studio form unless you also set it to "fal default". The file input that feeds a Field now owns it, so the form asks for the file once and the editor says "Users fill this in through the file input …".

🔑 **The operator can see the Admin link.** A super admin without the `admin` role, like the account created on first run, could open `/admin` but had no **Admin** entry in the account menu and no **Downloader** under **Tools**. The nav now uses the same check as `/admin`, so super admins and Admin-group members see both.

### 🧪 Under the hood

The fake fal service learned a `[flagged]` prompt that fails the way the content checker does, and a spec now checks it ends in Failed. New nav specs cover the bootstrap super admin and an Admin-group member. The admin layout switched from `overflow-x: hidden` to `clip`, which is what lets the sticky Save bar stick.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.8.3 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #249 (for #238, #247, #248).

## v4.8.2 (2026-11-05)

**The One Where Showing Our ID Got Us Thrown Out**

Turns out fal's catalog hands out model schemas to anyone who asks, except to people who show their API key. We showed ours, every time, politely. v4.8.1 fixed a real bug that wasn't the one blocking you. This one is.

### 🐛 Fixed

🔑 **Models can be added again, for real this time.** When our fal key came along on the catalog request, fal answered every model's schema with "Failed to fetch OpenAPI schema". So **Admin → Studio → Models → Add model** failed for every model, `fal-ai/nano-banana-2` included. The Studio now fetches schemas without the key, which is how fal serves them. Generating, pricing and billing still use the key. The daily schema check got the same fix.

🗯️ **Errors that say what went wrong.** If fal can't load a model's schema, the toast now shows fal's own message instead of "has no input or output schema", the message that sent us looking in the wrong place.

### 🧪 Under the hood

Unit tests check that only the schema lookup leaves the key at home. The fake fal in the e2e stack now serves its catalog without a key, like the real one.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.8.2 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #245 (for #244).

## v4.8.1 (2026-11-05)

**The One Where Half the Catalog Was Wearing a Fake Moustache**

One day after the Studio launched, it turned out about half of fal's catalog couldn't be added as a Model at all. GPT Image, Nano Banana 2.1, Seedream, Grok Imagine and friends all bounced off with the same error. This patch lets them in.

### 🐛 Fixed

🥸 **Aliases welcome.** Many fal models are aliases for another app, like `openai/gpt-image-2`, which fal documents as `fal-ai/gpt-image-2`. Adding one under **Admin → Studio → Models** failed with "fal's OpenAPI document … has no input or output schema", because we looked the schema up by the id you picked. We now read the path from fal's document itself. Models keep the id you chose, and the daily schema check handles aliases the same way. In a random sample of 40 catalog models, 20 were aliases, and all 40 now add cleanly.

### 🧪 Under the hood

A unit test pins the alias case in `src/libs/studio/openapi.test.ts`.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.8.1 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #242 (for #241).

## v4.8.0 (2026-11-04)

**The One Where the AI Moves Into Its Own Studio**

The old AI corner ran on Replicate, kept its variables in three places, and forgot your image the moment you closed the tab. We tore it out and built the Studio on fal.ai: admins curate what's on offer, you pick, type and hit Generate, and the server keeps working after you've wandered off. Also, the server now knows your real IP address behind a proxy, which matters more than it sounds.

### ✨ New

🎨 **Studio, at `/studio`.** Pick a Category, then a Model or a Template, fill in the form and press **Generate**. Images, video, audio and 3D models play right in the history. Generations run on the server, so closing the tab costs you nothing. A toast in every open tab tells you when it's done, and the **Studio** nav entry shows how many finished while you looked away. Outputs expire after 7 days unless you **Save to Files**. Each history entry also has **Again** with a fresh seed, **Use settings**, **Delete** and **Continue with …**, which hands an Output to another Category, say an image to a video Model. It works at phone width too, with the history below the form.

🧩 **Templates with blanks to fill in.** Admins write the prompt once, e.g. `Turn the person into {style: Anime | *Comic}`, and every `{…}` becomes a Variable card on its own: text, choice, multi-choice, number, switch or file, with groups and show-if conditions. Users see friendly labels; fal gets the values. Admins also get **Save as Template** in the history, which turns a Generation they liked into a Template draft. They edit Templates under **Admin → Studio → Templates**.

🛠️ **Models the admin actually picked.** Under **Admin → Studio → Models**, admins search the fal catalog, add a Model, and decide per Field whether Users see it (`shown`), never touch it (`fixed`) or get fal's default. **Test** runs it on the spot. Categories get sorted with drag and drop.

💸 **Budgets.** Every User has a monthly Budget in US dollars. It's the default from **Admin → Studio → Settings** unless their user page sets their own amount or unlimited. The Studio shows the estimated cost before you click and refuses once the Budget is gone. Estimates are swapped for what fal actually billed when a billing key is set. **Admin → Studio → Overview** shows spend per month and User, failure rates per Model and the fal balance. It never shows a successful prompt or Output. Those stay yours.

🔍 **Schema drift, caught before it bites.** A daily check compares each Model with what fal currently serves. Changed Models get a "Schema changed" or "Deprecated" badge, and the Model editor shows the diff, which Fields and Templates it touches, and an **Apply** button that refuses until everything left over is fixed.

🛰️ **A Client IP card for the admin.** The admin start page shows the connection address, the `X-Forwarded-For` chain with hop numbers, the address the app derives, and a warning when `TRUSTED_PROXY_HOPS` looks wrong. It even suggests the right value when Cloudflare is in the chain.

### 🐛 Fixed

🕵️ **No more picking your own IP.** Sign-in rate limits and sessions used to trust `cf-connecting-ip`, so anyone who reached the origin directly could get a fresh rate-limit bucket on every attempt. The client IP now comes from the connection, or from `X-Forwarded-For` counted from the right by `TRUSTED_PROXY_HOPS`. The audit log records that same address, not whatever the client put first.

🧾 **Audit rows know their session again.** The audit log looked for a cookie name we stopped using, so no row had a session ID. Now they do.

🎚️ **Sliders with names.** Zoom, volume and fade sliders in the audio editor and the player now tell screen readers what they are.

### 🧪 Under the hood

The E2E stack got a fake fal service, so the Studio specs never spend a cent. Specs for the Studio screen, Models, Templates, schema drift and Budgets are new, and the Budget spec runs last in its own `instance-wide` Playwright project because it changes the default for everyone. The image cache went out with the old AI, along with its admin page and cleanup task. `CONTEXT.md` learned the Studio's words, and ADRs 0008–0010 record why fal, why the server runs Generations, and why admins can't see successful ones.

### ⬆️ Upgrade

Migration `drizzle/20261104101641_studio_foundation` drops the old AI tables (`ai_generation`, `template`, `template_generation`, `template_global_variable`, `global_variable`, `generation_model`, `model_field`, `editing_model`, `editing_model_field`, `image_preset`, `cached_image`) with their data, and creates the Studio tables. Back up first if you want the old generations. Run `bun run db:migrate`.

Environment:
- Remove `REPLICATE_API_TOKEN`; it's no longer read.
- Add `FAL_KEY` (a fal API key) to turn the Studio on. Without it the Studio, its nav entry and its admin pages stay hidden.
- Optional: `FAL_BILLING_KEY`, a fal key with `BILLING` or `FULL` scope, to settle actual costs and show the fal balance.
- fal reports results by webhook only when `PUBLIC_BASE_URL`, or `BETTER_AUTH_URL` if that is unset, is `https` on a public host. Otherwise the server polls fal, which works too.
- New `TRUSTED_PROXY_HOPS`, default `0`, now passed through `docker-compose.yml`. Behind a proxy, set it to the number of proxies that append to `X-Forwarded-For`: 1 for Cloudflare alone, 2 for Cloudflare in front of Traefik. Left at `0`, every user shares the proxy's address and one sign-in bucket of 5 attempts per 15 minutes. Raise it only when the origin is reachable through those proxies alone.

The v4.8.0 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #239 (for #219, #220, #221, #222, #223, #224, #225, #226, #227) and #235 (for #100, #161, #234, #236, #237).

## v4.7.3 (2026-11-03)

**The One Where We Couldn't See Our Own Release**

We published v4.7.2 and our admin panel told us we were up to date with v4.7.1. It had stored GitHub's answer for six hours and wasn't going to ask again. Now you can make it ask.

### ✨ New

🔄 **Ask GitHub again.** The Version card on the admin start page has a **Check now** button. It skips the server's six-hour cache and fetches the latest release from GitHub right away, so a release you published a minute ago shows up straight away. GitHub allows 60 unauthenticated checks an hour per IP, so don't click it like it owes you money.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.7.3 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #232 (for #231).

## v4.7.2 (2026-11-03)

**Spring Cleaning in November**

Every dependency is on its latest version again. Nothing new to click this time. This is the release where we vacuum behind the couch, and found one column in there that better-auth stopped using.

### 🔧 Improved

🌊 **Waveforms, measured once.** wavesurfer.js 8 scales the audio editor's waveform against the loudest point of the whole file instead of each drawn section, so bar heights can look a little different than before. Same audio, more honest picture.

### 🧪 Under the hood

better-auth went from 1.7.1 to 1.7.15 and is back to identifying accounts by provider and account ID, like 1.6 did. The `issuer` column on `account` goes away with it. Without that migration, creating a user or setting a password would fail.

Drizzle moved to 1.0.0-rc.5 and its migration snapshots got rewritten to the new format. No existing migration changed.

The rest of the pile: React 19.3, zod 4.6, dotenv 18, motion 14, lucide-react 1.67, Base UI 1.9, Vite 8.3, Nitro 3 RC, Biome 2.6, Playwright 1.64, AWS SDK, TanStack and sharp. Biome 2.6 now formats Markdown and YAML by default, and we told it no.

### ⬆️ Upgrade

**This release needs a database migration.** The image's entrypoint applies it on start. Elsewhere, run `bun run db:migrate` when you deploy:

- `20261103103546_better_auth_drop_issuer` drops the `account.issuer` column and its `account_issuer_accountId_key` index. The column only held the derived value `local:credential`, so no data is lost.

No new environment variables.

The v4.7.2 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #229, for #228.

## v4.7.1 (2026-11-01)

**Dear Diary**

LunaShare now keeps a diary. Every release, from the very first Bun build to this one, is written up in `CHANGELOG.md`, and from now on each new release adds its own page. Yes, this release is mostly about writing about releases. We're aware.

### ✨ New

📖 **A changelog that lives in the repo.** `CHANGELOG.md` at the root lists every version from v2.11.0 onward, newest first, retold with considerably more jokes than the originals. Upgrade steps, migrations and warnings kept their exact wording, so you can still deploy from it without laughing at the wrong moment.

✍️ **Release notes write themselves (almost).** A new release skill in `.claude/skills/release/` gathers everything merged since the last tag, drafts the entry, waits for a human to approve it, then lands the version bump and publishes the GitHub release with the same text. Changelog and release page can't drift apart anymore.

### 🧪 Under the hood

`package.json` finally says the right version again. It had been stuck on 4.4.0 for three releases.

### ⬆️ Upgrade

No migrations and no new environment variables.

The v4.7.1 tag triggers the GHCR image build and publishes the versioned and latest tags. Deployment is still manual.

Implemented in #217, for #216.

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
