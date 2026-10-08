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

## Writing a spec

Import `test` from `fixtures/test.ts`, not from `@playwright/test`. It provides:

| Fixture | What it is |
| --- | --- |
| `adminPage`, `adminRequest` | Page / API context signed in as the bootstrap admin |
| `page`, `context`, `request` | Playwright's own, signed out |
| `bucket` | `{ client, name }`: an S3 client on the stack's RustFS |
| `db` | Drizzle on the stack's Postgres. Reads, and backdating `file.created_at` only |
| `stack` | The `E2E_*` values (base URL, CDN URL, admin credentials, …) |

Every browser and API context sends its own random `cf-connecting-ip`, because
production keys the sign-in rate limiter on it. Sessions come from the real login
form in `setup/auth.setup.ts`; never forge one or hard-code a cookie name.

For a control that is inert until hydration, use `clickUntil` from `utils/hydration.ts`
rather than a timeout.

## Things that differ from dev

- Production mode: `Secure` cookies (Chromium accepts them on `http://localhost`),
  the sign-in rate limiter, and the Bun server's 10 second idle timeout.
- The app reaches RustFS as `host.docker.internal`, and the test browser maps that
  name to `127.0.0.1` (`--host-resolver-rules` in `playwright.config.ts`), because
  presigned URLs sign the host. Node-side code (`bucket`) uses `127.0.0.1` directly.
- RustFS ignores per-object ACLs, so every object is readable at its raw bucket URL.
  Assert privacy at the app's surfaces (`/view`, `/cdn`, `/api/d`, `/api/download`), never at the bucket.
