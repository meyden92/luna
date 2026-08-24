FROM oven/bun:1-alpine AS base
WORKDIR /app

# --- dependencies -----------------------------------------------------------
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl vips-dev

COPY package.json bun.lock ./
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# --- build ------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No deployment URLs here on purpose: CDN_URL and PUBLIC_BASE_URL are read from
# the environment at runtime, so this image is not tied to any one domain.
ARG BUILD_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV BUILD_COMMIT=$BUILD_COMMIT
ENV BUILD_TIME=$BUILD_TIME
ENV NITRO_PRESET=bun

RUN bun run build

# --- runtime ----------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production

ARG BUILD_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV BUILD_COMMIT=$BUILD_COMMIT
ENV BUILD_TIME=$BUILD_TIME

# `sharp` loads native code at runtime. There is no code-generation step any
# more: the Drizzle schema is ordinary TypeScript, so the build no longer needs
# a database URL to produce a client (issue #46).
RUN apk add --no-cache libc6-compat openssl vips

# The oven/bun image ships a non-root `bun` user (uid 1000); reuse it rather
# than creating another one.
COPY --from=builder --chown=bun:bun /app/.output ./.output
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./package.json

# LunaShare sends no email, so `auth:set-credentials` is the only way back into
# an instance nobody can sign in to. Bun runs the TypeScript directly; the
# script reaches into `src/`, and tsconfig is what resolves the `@/` aliases.
COPY --from=builder --chown=bun:bun /app/scripts ./scripts
COPY --from=builder --chown=bun:bun /app/src ./src
COPY --from=builder --chown=bun:bun /app/tsconfig.json ./tsconfig.json

# Nothing applies migrations on start, so `db:migrate` has to be runnable in the
# container. Without these the app boots against whatever schema it finds and
# fails on the first query for a column it expects.
COPY --from=builder --chown=bun:bun /app/drizzle ./drizzle
COPY --from=builder --chown=bun:bun /app/drizzle.config.ts ./drizzle.config.ts

USER bun

EXPOSE 3000

ENV PORT=3000
# Nitro's bun preset reads HOST (via srvx), not the HOSTNAME the node preset used.
ENV HOST="0.0.0.0"
ENV TZ=UTC
CMD ["bun", ".output/server/index.mjs"]
