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

1. Removes anything a crashed run left behind (Compose projects named `lunashare-e2e-*`).
2. Picks free ports and generates every secret fresh.
3. Builds the production `Dockerfile` from the working tree as `lunashare:e2e`.
4. Starts Postgres and RustFS (`docker-compose.e2e.yml`), creates the bucket with an anonymous-read policy.
5. Starts the app. Its entrypoint applies the migrations, as in a deployment.
6. Bootstraps the admin the operator's way: a User row, then `auth:set-credentials` inside the app container.
7. Runs Playwright with the stack described in `E2E_*` env vars (`stack-env.ts`).
8. Removes the stack and its volumes, also after a failure, Ctrl-C or SIGTERM. The image and build cache stay.

The run exits with Playwright's exit code. Reports, traces, screenshots and
videos stay in `playwright-report/` and `test-results/` after the stack is gone.
Replicate is never configured, so nothing costs money.

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
| `db` | Drizzle on the stack's Postgres. Reads, and backdating `file.created_at` only |
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

- `utils/files-screen.ts` reads the Files screen: `cardTitles` and `dateGroups` (what is listed, in page
  order), `loadAll(page, n)` (scrolls until n cards are loaded), `scopeRow`, `countLine`, and `asListed`
  (the page order of a sorted list: files stay together under their date heading, headings ordered by first file).
- `utils/own-files.ts` gives a data-changing spec its own files: `uniquePrefix`, `uploadOwnFiles` (corpus files through
  `/api/upload/web`, titled `<prefix> <name>`, optionally in a folder or private), `openOwnFiles` (Files screen narrowed to
  the prefix by search), `cardOf`, `openCardMenu`, `createFolderThroughSidebar` and `folderIdOf`.
- `utils/preview.ts` helps with the Preview overlay: `previewOf(page, title)` (its dialog is named by the file), `previewCounter` ("N / total") and `galleryFileIds(db)` (title -> id of the gallery user's files, to open `/dashboard?file=<id>`).
- `utils/uploads.ts` helps upload specs: `storedFile(db, bucket, title)` (the row plus the object's bytes; the bucket key is
  `<ownerId>/<decoded url>`), `bucketKeysContaining`, `createToken`/`revokeToken`/`withToken` (Settings -> Upload tokens;
  the key is shown once), `sharexPost` (a ShareX POST with the Token in the header or the form), `setTokenOptions`
  (compress, convert to JPEG and quality have no UI: it replays the `updateTokenSettings` call the page makes; options apply to
  all of the user's Tokens) and `declaredLengthPost` (declares a `Content-Length` without sending the body).

## Things that differ from dev

- Production mode: `Secure` cookies (Chromium accepts them on `http://localhost`),
  the sign-in rate limiter, and the Bun server's 10 second idle timeout.
- The app reaches RustFS as `host.docker.internal`, and the test browser maps that
  name to `127.0.0.1` (`--host-resolver-rules` in `playwright.config.ts`), because
  presigned URLs sign the host. Node-side code (`bucket`) uses `127.0.0.1` directly.
- RustFS ignores per-object ACLs, so every object is readable at its raw bucket URL.
  Assert privacy at the app's surfaces (`/view`, `/cdn`, `/api/d`, `/api/download`), never at the bucket.
- The stack sets `MAX_SHAREX_UPLOAD_BYTES` to 10 MiB (`docker-compose.e2e.yml`, mirrored as `SHAREX_MAX_UPLOAD_BYTES` in
  `stack-env.ts`), so the ShareX oversize refusal is tested with a small buffer instead of 200 MiB.

## Fixture corpus

`fixtures/files/` holds the committed files specs upload (about 5 MB); `fixtures/corpus.ts`
describes each one (type, Files-screen kind, size, dimensions, metadata, edge case, whether
`/api/upload/web` accepts it) and throws on import if the folder and the table disagree.
Look files up with `corpusFile`, `corpusByKind`, `corpusEdgeCase`, `corpusUploadable`.
`generate-corpus.ts` reproduces every non-image file; the images and `clip.mp4` are
committed outputs of `prep-images.ts` and `make-video.swift`.
