# E2E Tests (Playwright)

End-to-end tests for LunaShare. Run against the real TanStack Start app and a real MariaDB instance.

## Quickstart

```bash
# 1. one-time: download chromium
bun run test:e2e:install

# 2. ensure DATABASE_URL and BETTER_AUTH_SECRET are exported (or in .env / .env.local)

# 3. run all tests (auto-starts bun run dev on :3000)
bun run test:e2e

# 4. interactive runner
bun run test:e2e:ui

# 5. headed (watch the browser)
bun run test:e2e:headed
```

The HTML report is written to `playwright-report/index.html` after a run.

## How auth works

`global-setup.ts` runs once before the suite. It:

1. Upserts two test users in the dev DB:
   - `e2e-user@lunashare.test` — regular user
   - `e2e-admin@lunashare.test` — `isSuperAdmin: true`
2. Creates a `Session` row per user with a random token.
3. Signs the token using `BETTER_AUTH_SECRET` (HMAC-SHA256, base64) — same scheme Better-Auth's `setSignedCookie` uses.
4. Writes Playwright `storageState` JSON to `tests/e2e/.auth/{userId}.json` and exports the paths via `E2E_USER_STORAGE` / `E2E_ADMIN_STORAGE`.

Tests then use the `authenticatedPage` / `adminPage` fixtures from `fixtures/auth.ts`, which open a browser context preloaded with the right session cookie.

`global-teardown.ts` deletes every `User` whose email ends with `@lunashare.test`. Sessions/Accounts cascade. Set `E2E_KEEP_DATA=1` to skip cleanup when debugging.

## Layout

```
tests/e2e/
├── .auth/                  # generated session JSON (gitignored)
├── fixtures/
│   ├── auth.ts             # authenticatedPage, adminPage
│   └── locale.ts           # setLocale(context, 'en' | 'de')
├── utils/
│   ├── db.ts               # Prisma client + test constants
│   └── sign-cookie.ts      # HMAC signing matching better-call/setSignedCookie
├── public/                 # tests for unauthenticated routes
├── auth/                   # tests for /login + auth gating
├── dashboard/              # tests using authenticatedPage
├── admin/                  # tests using adminPage
├── i18n/                   # locale switching
├── global-setup.ts
└── global-teardown.ts
```

## Writing a new test

For unauthenticated routes, import from `@playwright/test`:

```ts
import { expect, test } from '@playwright/test';

test('public landing renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
```

For authenticated routes, import `test` from `../fixtures/auth` (and `expect` from `@playwright/test`):

```ts
import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test('dashboard loads', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/dashboard');
  await expect(authenticatedPage).toHaveURL(/\/dashboard/);
});
```

## Required env vars

- `DATABASE_URL` — MariaDB connection (same as the dev app uses).
- `BETTER_AUTH_SECRET` — must match the value the running app uses; otherwise the signed cookie will be rejected by `auth.api.getSession`.

Optional:

- `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`)
- `PLAYWRIGHT_PORT` (default `3000`)
- `E2E_KEEP_DATA=1` — skip teardown for post-mortem debugging.
