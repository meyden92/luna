# End-to-end tests

The suite runs against a disposable installation of LunaShare, never against the
dev server or the dev database. Why: `docs/adr/0006-e2e-runs-the-production-image-in-a-disposable-stack.md`.

## Running

```sh
bun run test:e2e                                   # whole suite
bun run test:e2e -- tests/e2e/admin/landing.spec.ts
bun run test:e2e -- --grep "admin"
bun run test:e2e -- --ui                           # or --headed, --debug
bun run test:e2e:report                            # open the last HTML report
```

Every argument after `--` goes to `playwright test`. The `setup` project always
runs first, because the other specs depend on its stored sessions.

Needs Docker (with Compose), Bun, an internet connection and Playwright's
Chromium (`bun run test:e2e:install`). No `.env`, no dev database, no dev server.

## What a run does

`scripts/e2e/run.ts`, step by step (each step is logged with an `[e2e]` prefix):

1. Refuses to start while another run in the same checkout is alive (`tests/e2e/.run.lock`): runs share `tests/e2e/.auth` and `test-results/`. Run concurrent suites from separate worktrees.
2. Removes anything a crashed run left behind (Compose projects named `lunashare-e2e-<runner pid>-*` whose runner process is gone). Stacks of runs still in progress are left alone.
3. Picks free ports and generates every secret fresh.
4. Builds the production `Dockerfile` from the working tree as `lunashare:e2e`, and the fake fal service (`stack/fal-fake/`).
5. Starts Postgres, RustFS and the fake (`docker-compose.e2e.yml`), creates the bucket with an anonymous-read policy.
6. Starts the app. Its entrypoint applies the migrations, as in a deployment.
7. Bootstraps the admin the operator's way: a User row, then `auth:set-credentials` inside the app container.
8. Runs Playwright with the stack described in `E2E_*` env vars (`stack-env.ts`).
9. Removes the stack and its volumes, also after a failure, Ctrl-C or SIGTERM. The image and build cache stay.

The run exits with Playwright's exit code. Reports, traces, screenshots and
videos stay in `playwright-report/` and `test-results/` after the stack is gone.
The app talks to the fake fal service only, with a dummy key, so nothing costs money.

## Users

The `setup` projects run before every spec, in order (`playwright.config.ts`):

1. `setup/auth.setup.ts`: the bootstrap admin signs in through `/login`.
2. `setup/users.setup.ts`: the admin creates every other user through the "Create user"
   dialog on `/admin/users`, sets the quota user's quota on its detail screen, and each
   user signs in through `/login`. Sessions go to `.auth/<role>.json` (gitignored).
3. `setup/gallery.setup.ts`: seeds the gallery user (below).

| Role | Username | For |
| --- | --- | --- |
| `admin` | `e2eadmin` | Admin screens |
| `gallery` | `e2e-gallery` | The read-only seeded dataset. No spec may change its data |
| `quota` | `e2e-quota` | Quota of `QUOTA_USER_QUOTA_MIB` (4 MiB), so a few corpus files exceed it |
| `empty` | `e2e-empty` | No files, for empty states |
| `worker<N>` | `e2e-worker<N>` | One per Playwright worker, for specs that change data |

`fixtures/users.ts` has the credentials (`fixtureUser(role)`; passwords are derived from
the run's random admin password, so a spec that signs in through the form can compute them).

A spec that must break a user (change its password, sign it out everywhere) makes its own with
`createUserThroughAdmin(adminPage, user)` from `utils/admin-users.ts`, the same dialog flow the setup uses.
Around it: `throwawayUser(label)` makes credentials only that test knows (email `zz-...`, sorting after the
fixtures), `signedInDevice(browser, account)` returns a page for it in its own context and address, and
`userIdOf(db, email)` finds its id.

## The gallery dataset

`fixtures/gallery.ts` describes exactly what the gallery user holds, so specs assert against
data rather than literals:

- `GALLERY_UPLOADS`: 125 files (more than four pages of 30): the whole corpus, then copies
  titled `<stem> (2)<ext>`, `<stem> (3)<ext>`. Each has its `source` corpus entry, its
  folder (`Travel`, `Work`, `Archive` or `null` for "Not in a folder") and whether it is private.
- `dateAnchors(now)`: the calendar points files are backdated to, each with the date-group
  heading the Files screen shows for it. Today, yesterday, earlier this week (Wednesday
  onwards only), earlier this month (when the 2nd is before this week), the 15th of the
  three previous months, and June 15 last year. All UTC, away from midnight.
- `galleryDataset(seededAt)` adds `createdAt` and `group` to every file (all distinct, so
  date sorts have one right order), the `groups` newest first, and `totalBytes`.
- `matchesSearch(file, term)`: what the Files search box finds. ShareX tags every upload
  `sharex-upload`, so a term inside that word matches everything.

Seeding goes through the app: a Token from Settings, folders from the Files sidebar, ShareX
uploads (two at a time, paced under the 60-per-minute limit, which takes about two minutes),
the Token's folder default, and the card menu's "Make private". The only direct write is
backdating `file.created_at`. Setup records the moment it computed the dates from in
`.auth/gallery-seed.json`; the `gallery` fixture rebuilds the dataset from it.

## Writing a spec

Import `test` from `fixtures/test.ts`, not from `@playwright/test`. It provides:

| Fixture | What it is |
| --- | --- |
| `adminPage`, `adminRequest` | Page / API context signed in as the bootstrap admin |
| `galleryPage`, `galleryRequest` | The gallery user |
| `workerPage`, `workerRequest` | This worker's own user (`testInfo.parallelIndex`) |
| `quotaPage`, `quotaRequest` | The quota user |
| `emptyPage`, `emptyRequest` | The empty user |
| `page`, `context`, `request` | Playwright's own, signed out |
| `gallery` | The seeded dataset (`GalleryDataset`) |
| `corpus` | The fixture files: `files`, and the lookups `file`, `byKind`, `edgeCase`, `uploadable` |
| `bucket` | `{ client, name }`: an S3 client on the stack's RustFS |
| `db` | Drizzle on the stack's Postgres. Reads, backdating `file.created_at`, seeding/backdating form shares (`utils/form-shares.ts`), seeding Generations (`studio/smoke.spec.ts`, `admin/studio/templates.spec.ts`), and seeding Studio Categories and Models (`utils/studio.ts`) |
| `stack` | The `E2E_*` values (base URL, CDN URL, admin credentials, …) |

- Specs that change data use the worker user and only assert on items they created,
  found by a title unique to the test. Specs that assert totals use the gallery, quota
  or empty user.
- Every browser and API context sends its own random `cf-connecting-ip`, because
  production keys the sign-in rate limiter on it. Sessions come from the real login
  form; never forge one or hard-code a cookie name. `utils/sign-in.ts` signs in a fresh context
  (`signInThroughForm`), or submits a `/login` form the page is already on (`submitLoginForm`, for `?redirect=` flows).
- Uploads are rate limited per user (60 per minute for each upload route, and ShareX
  allows two in flight). Spread heavy uploading across workers instead of working around it.
- For a control that is inert until hydration, use `clickUntil` from `utils/hydration.ts`
  rather than a timeout.
  For a form field on a page, `untilHydrated(locator)` waits until React has attached to the element, so `fill` is not
  lost to hydration.
- `utils/files-screen.ts` reads the Files screen: `cardTitles` and `dateGroups` (what is listed, in page
  order), `loadAll(page, n)` (scrolls until n cards are loaded), `scopeRow`, `countLine`, and `asListed`
  (the page order of a sorted list: files stay together under their date heading, headings ordered by first file).
- `utils/own-files.ts` gives a data-changing spec its own files: `uniquePrefix`, `uploadOwnFiles` (corpus files through
  `/api/upload/web`, titled `<prefix> <name>`, optionally in a folder or private), `openOwnFiles` (Files screen narrowed to
  the prefix by search), `cardOf`, `openCardMenu`, `createFolderThroughSidebar` and `folderIdOf`.
- `utils/studio.ts` sets up the Studio screen: `seedStudioModel(db, stack, { label, endpointId, fields? })` writes a Category
  holding one Model of a fake endpoint, configured as an admin's "Add" would (fal's schema and price, default Field cards;
  `fields` adjusts them), with `uniquePrefix` names. `openStudio(page, model)` opens it, and `historyEntry(page, model)` is
  the Model's newest history entry.
- `utils/preview.ts` helps with the Preview overlay: `previewOf(page, title)` (its dialog is named by the file), `previewCounter` ("N / total") and `galleryFileIds(db)` (title -> id of the gallery user's files, to open `/dashboard?file=<id>`).
- `utils/media.ts` checks media as a user's player would: `decodeMedia(page, bytes, mimeType)` plays bytes in the page and returns `{ duration, width, height }` (rejects if undecodable), and `recordClipWithSound(page, seconds)` records an MP4 with a video and an audio track in Chromium (`clip.mp4` has no audio).
- `utils/ffmpeg.ts` has `serveFfmpegCore(page)` for specs of tools that run ffmpeg.wasm (video editor, converter, audio editor's MP3). Call it before `goto`: the test contexts' made-up `cf-connecting-ip` header makes the CDN answer 403, so the core is fetched from node instead. Those specs need the internet.
- `utils/served-files.ts` gives the serving specs (`serving/`) a seeded gallery file to read: `servedFile(gallery, db, corpusName, { private })` returns its `id`, `title`, corpus `entry` and the expected `bytes` (the first copy with that visibility; e.g. the public `tone.mp3` is `tone (2).mp3`). Read only, so those specs upload nothing.
- `utils/form-shares.ts` seeds a form share for a fixture user: `seedFormShare(db, stack, owner, { title, fields, expiresAt?, maxViews? })`
  returns the share id for `/form/<id>`. No screen creates shares (the builder dialog is not mounted) and server function ids are
  hashed, so it writes the rows `createFormShare` would, encrypting sensitive values with `E2E_FORM_FIELD_ENCRYPTION_KEY` (the
  key the app container runs with). The public claim limit is per connection address, which is the same for the whole suite:
  a spec that exhausts it belongs last in a serial file.
- `utils/uploads.ts` helps upload specs: `storedFile(db, bucket, title)` (the row plus the object's bytes; the bucket key is
  `<ownerId>/<decoded url>`), `bucketKeysContaining`, `createToken`/`revokeToken`/`withToken` (Settings -> Upload tokens;
  the key is shown once), `sharexPost` (a ShareX POST with the Token in the header or the form), `setTokenOptions`
  (compress, convert to JPEG and quality have no UI: it replays the `updateTokenSettings` call the page makes; options apply to
  all of the user's Tokens) and `declaredLengthPost` (declares a `Content-Length` without sending the body).

## The fake fal service

The Studio runs against `fal-fake` (`stack/fal-fake/server.ts`), a Bun server in the stack that answers exactly the calls
the app's fal client makes: the Platform API's `/v1/models` (with `q`, `category`, `endpoint_id`, `status`, `limit`/`cursor`
and `expand=openapi-3.0`), `/v1/models/pricing` and `/v1/models/billing-events`, the queue (submit, status, result, cancel)
and storage uploads. The app's `FAL_KEY` and `FAL_BILLING_KEY` are per-run dummies that only the fake accepts (billing
events want the billing key), and the fake makes no outbound connections. Webhooks stay off, because the app's base URL
is plain http on localhost, so the poller finishes every Generation (it polls every 3 s).

The catalog is fixed (`stack/fal-fake/catalog.ts`; import `FAKE_MODELS` / `fakeModel(id)` instead of copying schemas):

| Endpoint | Category | Input | Price | Result |
| --- | --- | --- | --- | --- |
| `fake/image` | `text-to-image` | `prompt`*, `aspect_ratio` (enum via `$ref`, default `1:1`), `num_images` 1–4, `seed` (nullable) | 0.03 / `image` | `num_images` PNGs, 128×128 |
| `fake/edit` | `image-to-image` | `prompt`*, `image_urls`* (1–4) | 0.04 / `image` | one PNG |
| `fake/video` | `image-to-video` | `prompt`*, `image_url`*, `duration` 5–10 (default 5) | 0.10 / `second` | `clip.mp4` |
| `fake/audio` | `text-to-audio` | `prompt`* | 0.02 / `request` | `tone.mp3` |
| `fake/3d` | `image-to-3d` | `image_url`* | 0.25 / `request` | a one-triangle GLB |
| `fake/llm` | `llm` | `prompt`* | 0.001 / `request` | text only: the Studio must never offer it |
| `fake/drift` | `text-to-image` | as `fake/image` | 0.03 / `image` | as `fake/image`; reserved for schema-swap specs |

(* required.) A request stays `IN_PROGRESS` for one second, then completes; the result points at media the fake serves
itself. Billing events exist for succeeded requests, at the list price times the units (`num_images`, `duration`, else 1).

Control hooks, written anywhere in a request's input (usually the prompt):

- `[fail]`: the request completes with a fal-style model error (422, `detail[0].type` and `error_type` `fake_failure`).
- `[slow]`: the request stays `IN_PROGRESS` until it is cancelled (cancel answers 202, then it completes as cancelled) or
  released with `POST /__control/release` `{ request_id }`.
- `[cost=<usd>]`: billing events report this amount instead of the list price, so a spec can tell a settled cost from the estimate.

And endpoints, wrapped for specs in `utils/fal-fake.ts`:

| Endpoint | Helper | What |
| --- | --- | --- |
| `GET /__control/requests` | `falRequests(stack)`, `falRequestContaining(stack, text)` | Every request the fake received, with the exact `input` the app sent. `falRequestContaining` waits for the one whose input contains `text` |
| `GET /__control/uploads` | `falUploads(stack)` | Every storage upload: `file_url` (what an input names), `file_name`, `content_type`, `size`, lifecycle |
| `POST /__control/release` | `releaseFalRequest(stack, requestId)` | Lets a `[slow]` request finish |
| `POST /__control/schema` | `setFalModel(stack, endpointId, { input?, status? })` | Serves another `<Name>Input` schema and/or status (`deprecated`) for an endpoint; each call states the whole override, so `{}` restores it |

`falFakeClient(stack)` is the app's own fal client pointed at the fake (`E2E_FAL_URL`), for specs that talk to the queue
directly. The fake is shared by every worker: find your requests by a `uniquePrefix` in the prompt, and swap schemas only
on `fake/drift`. It hands out URLs under its service name, `http://fal-fake:<port>`, which the app container resolves and
the browser maps to `127.0.0.1` (catalog thumbnails, uploaded inputs).

## Things that differ from dev

- Production mode: `Secure` cookies (Chromium accepts them on `http://localhost`),
  the sign-in rate limiter, and the Bun server's 10 second idle timeout.
- The app reaches RustFS as `host.docker.internal`, and the test browser maps that
  name to `127.0.0.1` (`--host-resolver-rules` in `playwright.config.ts`), because
  presigned URLs sign the host. Node-side code (`bucket`) uses `127.0.0.1` directly.
- RustFS ignores per-object ACLs, so every object is readable at its raw bucket URL.
  Assert privacy at the app's surfaces (`/view`, `/cdn`, `/api/d`, `/api/download`), never at the bucket.
- The bucket allows cross-origin GETs (`createBucket` in `scripts/e2e/run.ts`), as production's CDN does: the beautifier draws
  bucket images on a canvas ("source image could not be loaded" without it) and the player's `<audio>` is a CORS request.
- The stack sets `MAX_SHAREX_UPLOAD_BYTES` to 10 MiB (`docker-compose.e2e.yml`, mirrored as `SHAREX_MAX_UPLOAD_BYTES` in
  `stack-env.ts`), so the ShareX oversize refusal is tested with a small buffer instead of 90 MiB.

## Screenshots

```sh
bun run screenshots <label>   # e.g. before / after a styling change
```

Captures full-page screenshots of the public, share and admin routes in light and dark
into `.scratch/screenshots/<label>/` (gitignored), for before/after comparisons. It runs
`tests/screenshots/capture.spec.ts` on the same disposable stack through
`playwright.screenshots.config.ts` (admin and user setup, then the capture; no gallery
seeding), and tears the stack down afterwards. The spec lives outside `tests/e2e/`, so
`bun run test:e2e` never runs it. It seeds a public file, snippet and form share as the worker
user for the `/view`, `/embed`, `/bin/<id>` and `/form/<id>` pages.

## Fixture corpus

`fixtures/files/` holds the committed files specs upload (about 5 MB); `fixtures/corpus.ts`
describes each one (type, Files-screen kind, size, dimensions, metadata, edge case, whether
`/api/upload/web` accepts it) and throws on import if the folder and the table disagree.
Look files up with `corpusFile`, `corpusByKind`, `corpusEdgeCase`, `corpusUploadable`.
`generate-corpus.ts` reproduces every non-image file; the images and `clip.mp4` are
committed outputs of `prep-images.ts` and `make-video.swift`.
