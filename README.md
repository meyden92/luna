# LunaShare

File sharing and media platform built on TanStack Start.

**Stack:** TanStack Start (React 19, Vite 8, Nitro 3) · Prisma 7 + MariaDB · Better-Auth · Tailwind CSS 4 + shadcn/ui · Biome · Bun

## Requirements

- [Bun](https://bun.sh) ≥ 1.2 — runtime, package manager and script runner
- MariaDB (or via `docker-compose`)
- An S3-compatible object store

```bash
curl -fsSL https://bun.sh/install | bash
```

## Setup

```bash
# 1. install dependencies
bun install

# 2. configure environment
cp .env.sample .env   # then fill in the values

# 3. generate the Prisma client and apply migrations
bun run db:generate
bun run db:migrate

# 4. start the dev server on http://localhost:3000
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
| `bun run db:generate` | `prisma generate` |
| `bun run db:migrate` | `prisma migrate deploy` |
| `bun test` | Unit tests (scoped to `src/` — see `bunfig.toml`) |
| `bun run test:e2e` | Playwright end-to-end suite |

`bun test` and Playwright are deliberately separated: Bun's default test glob
also matches `*.spec.ts`, which would otherwise pick up the Playwright suite and
run it under the wrong runner. `bunfig.toml` scopes `bun test` to `src/`.

## Testing

End-to-end tests live in `tests/e2e` and are documented in
[`tests/e2e/README.md`](tests/e2e/README.md). They need a running database and a
`BETTER_AUTH_SECRET` matching the app under test.

```bash
bun run test:e2e:install   # one-time: download Chromium
bun run test:e2e           # auto-starts the dev server
bun run test:e2e:ui        # interactive runner
```

## Self-hosting

The published image is **not** tied to any domain. Deployment URLs are resolved
at runtime, not compiled into the bundle, so you can pull the image and point it
at your own infrastructure with environment variables alone — no rebuild:

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="mysql://user:pass@db:3306/lunashare" \
  -e CDN_URL="https://cdn.yourdomain.com" \
  -e BETTER_AUTH_SECRET="..." \
  ghcr.io/meyden92/luna:latest
```

`CDN_URL` is read from the process environment on the server and handed to the
browser as a snapshot injected into the document during SSR (see
`src/libs/runtime-config.ts`). Anything reached through `import.meta.env` would
instead be inlined as a string literal at build time and freeze one deployment's
domains into the image — which is why deployment URLs must not be added there.

`PUBLIC_BASE_URL` is optional: leave it unset and the auth client targets the
document's own origin. Set it only when the app is served from a different
origin than its auth API.

The image proxy's allowlist is derived from `CDN_URL` (plus Replicate's delivery
hosts, for AI generation), so it needs no configuration in a normal setup. Set
`PROXY_ALLOWED_DOMAINS` to a comma-separated host list only if you proxy images
from somewhere else:

```bash
PROXY_ALLOWED_DOMAINS=images.example.com,static.example.org
```

## Deployment

The build targets Nitro's `bun` preset, producing a server that boots on
`Bun.serve`. Override with `NITRO_PRESET` if a host needs a different target:

```bash
NITRO_PRESET=node-server bun run build
```

The image is built and published to GHCR by `.github/workflows/ci.yml` on tag
pushes. `docker-compose.yml` reads the image from `LUNASHARE_IMAGE` and takes all
secrets from the environment.

```bash
docker compose up -d
```

Deployment is triggered by a webhook stored in the `DEPLOY_WEBHOOK_URL` and
`DEPLOY_TOKEN` repository secrets; the deploy step is skipped when they are unset.

## Commit convention

The repository ships a commit template. Enable it once per clone:

```bash
git config commit.template .gitmessage
```
