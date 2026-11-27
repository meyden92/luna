# LunaShare

File sharing and media platform built on TanStack Start.

**Stack:** TanStack Start (React 19, Vite 8, Nitro 3) · Drizzle + PostgreSQL · Better-Auth · Tailwind CSS 4 + shadcn/ui · Biome · Bun

## Requirements

- [Bun](https://bun.sh) ≥ 1.2 — runtime, package manager and script runner
- PostgreSQL 18 (or via `docker-compose.dev.yml`)
- An S3-compatible object store
- `yt-dlp` and `ffmpeg` on `PATH` for Downloads (`brew install yt-dlp ffmpeg`). The "Update yt-dlp" task fails on a package-managed install, which is harmless in dev

```bash
curl -fsSL https://bun.sh/install | bash
```

## Setup

```bash
# 1. install dependencies
bun install

# 2. start the local database
docker compose -f docker-compose.dev.yml up -d --wait

# 3. configure environment
cp .env.sample .env   # then fill in the values

# 4. apply migrations
bun run db:migrate

# 5. create the dev accounts admin/admin and user/user, each with demo files
bun run db:seed

# 6. start the dev server on http://localhost:3000
bun run dev
```

`src/libs/env.ts` validates the environment with zod on first access, so a missing
or malformed variable fails loudly with the offending key named.

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Vite dev server on `:3000` |
| `bun run build` | Production build into `.output/` |
| `bun start` | Serve the build on Bun (`bun .output/server/index.mjs`) |
| `bun run check-all` | Format, lint and typecheck — run after every task |
| `bun run lint` | Biome lint |
| `bun run format` | Biome check + write |
| `bun run check-types` | Regenerate routes, then `tsc --noEmit` |
| `bun run generate:routes` | Regenerate the TanStack Router route tree |
| `bun run db:generate` | Generate a migration from the Drizzle schema |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:push` | Push the schema straight to the database (dev only) |
| `bun run db:seed` | Create `admin`/`admin` (super admin) and `user`/`user` with the e2e gallery files; skips accounts that exist, refuses a non-local database |
| `bun run db:audit-coverage` | Static audit-coverage report — see [`docs/db-verification.md`](docs/db-verification.md) |
| `bun test` | Unit tests (scoped to `src/` — see `bunfig.toml`) |
| `bun run test:e2e` | Playwright end-to-end suite in a disposable stack |

`bun test` and Playwright are deliberately separated: Bun's default test glob
also matches `*.spec.ts`, which would otherwise pick up the Playwright suite and
run it under the wrong runner. `bunfig.toml` scopes `bun test` to `src/`.

## Testing

End-to-end tests live in `tests/e2e` and are documented in
[`tests/e2e/README.md`](tests/e2e/README.md). Each run builds the production
image and tests it in a disposable Docker Compose stack, so it needs Docker but no
`.env`, dev database or dev server.

```bash
bun run test:e2e:install   # one-time: download Chromium
bun run test:e2e           # build, start, test, tear down
bun run test:e2e -- --ui   # extra arguments go to Playwright
```

## Self-hosting

The published image is **not** tied to any domain. Pull it and point it at your
own infrastructure, no rebuild. The environment holds only what the app needs
before it can reach its database:

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@db:5432/lunashare" \
  -e FORM_FIELD_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e BETTER_AUTH_URL="https://yourdomain.com" \
  ghcr.io/meyden92/luna:latest
```

`PUBLIC_BASE_URL` is optional: leave it unset and the auth client targets the
document's own origin. Set it only when the app is served from a different
origin than its auth API.

### Vault

Everything else is set in the admin area under **Settings → Vault**: the S3
connection (`AWS_ENDPOINT`, `AWS_REGION`, `AWS_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`), `CDN_URL`, the fal keys, the signing secrets,
`TRUSTED_PROXY_HOPS` and `PROXY_ALLOWED_DOMAINS`. On a fresh install the app
starts without storage; sign in as an admin, fill the Storage entries, and
uploads work at once. Every change applies immediately, without a restart.

Values are stored encrypted (AES-256-GCM) with a key derived from
`FORM_FIELD_ENCRYPTION_KEY`, and a secret is never shown again once saved.
Setting or clearing an entry asks for the admin's password. This protects the
secrets in a leaked database dump or backup and from anyone who can only use an
admin account; it does not protect them from someone who has both the
environment and the database, or who runs code on the server.

**Back up `FORM_FIELD_ENCRYPTION_KEY` outside the server.** Without it the Vault
cannot be decrypted, and every entry has to be set again.

Any Vault entry may also be set in the environment under the same name, and the
environment then wins. That is the way out when a wrong Vault value locks the
instance out, and how the E2E stack configures itself.

`CDN_URL` is resolved on the server and handed to the browser as a snapshot
injected into the document during SSR (see `src/libs/runtime-config.ts`).
Anything reached through `import.meta.env` would instead be inlined as a string
literal at build time and freeze one deployment's domains into the image, which
is why deployment URLs must not be added there.

The image proxy's allowlist is derived from `CDN_URL`, so it needs no
configuration in a normal setup. Set `PROXY_ALLOWED_DOMAINS` to a
comma-separated host list only if you proxy images from somewhere else, e.g.
`images.example.com,static.example.org`.

Rate limits, sign-in included, are keyed on the client's IP address. Set
`TRUSTED_PROXY_HOPS` to the number of reverse proxies in front of the app that
append to `X-Forwarded-For` (Cloudflare with a Traefik behind it is 2); the app
then takes the address that many entries from the right. Left at `0`, it uses the
connection's own address and ignores every forwarded header, so only raise it
when the origin is reachable through those proxies alone: anyone who can reach
it directly could otherwise choose their own address.
The admin start page's **Client IP** card shows the forwarded chain with the hop
number of each entry, the address the app derives from it, and a warning when the
value looks wrong.

### Studio

The Studio runs on [fal.ai](https://fal.ai) and stays off until the Vault's
`FAL_KEY` holds a fal API key. Without it the Studio, its nav entry and its admin
pages are hidden, and its routes answer 404.

`FAL_BILLING_KEY` is optional and must be a fal key with `BILLING` (or `FULL`)
scope. With it, a task every 10 minutes replaces each Generation's estimated
cost with what fal billed, and the Studio overview shows the fal balance.
Without it, the estimate is booked as the cost.

fal reports finished Generations by webhook to `/api/studio/fal-webhook`, but
only when the public base URL (`PUBLIC_BASE_URL`, or `BETTER_AUTH_URL` when that
is unset) is `https` on a public host. Otherwise the server polls fal every 3
seconds, which also works behind NAT and in development. With webhooks on, it
still polls once a minute for Generations whose webhook never came.

`FAL_QUEUE_BASE_URL`, `FAL_REST_BASE_URL` and `FAL_API_BASE_URL` point the app
at the E2E stack's fake fal service. Leave them unset in a deployment.

## Deployment

The build targets Nitro's `bun` preset, producing a server that boots on
`Bun.serve`. Override with `NITRO_PRESET` if a host needs a different target:

```bash
NITRO_PRESET=node-server bun run build
```

The image is built and published to GHCR by `.github/workflows/ci.yml` on tag
pushes. `docker-compose.yml` reads the image from `LUNASHARE_IMAGE` and passes
the environment described under [Self-hosting](#self-hosting); the rest lives in
the Vault.

```bash
docker compose up -d
```

After the image is pushed, the `deploy` job calls Coolify's deploy webhook. Its
URL and an API token with the `deploy` permission live in the `DEPLOY_WEBHOOK_URL`
and `DEPLOY_TOKEN` repository secrets; the job fails when either is missing.

## Commit convention

The repository ships a commit template. Enable it once per clone:

```bash
git config commit.template .gitmessage
```
