FROM oven/bun:1-alpine AS base
WORKDIR /app

# --- dependencies -----------------------------------------------------------
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl vips-dev

COPY package.json bun.lock ./
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN bunx prisma generate

# --- build ------------------------------------------------------------------
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.prisma ./.prisma
COPY --from=deps /app/prisma ./prisma
COPY . .

ARG VITE_PUBLIC_CDN_URL
ARG VITE_PUBLIC_SERVER_URL
ARG BUILD_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV VITE_PUBLIC_CDN_URL=$VITE_PUBLIC_CDN_URL
ENV VITE_PUBLIC_SERVER_URL=$VITE_PUBLIC_SERVER_URL
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

# `sharp` and the Prisma MariaDB adapter load native code at runtime.
RUN apk add --no-cache libc6-compat openssl vips

# The oven/bun image ships a non-root `bun` user (uid 1000); reuse it rather
# than creating another one.
COPY --from=builder --chown=bun:bun /app/.output ./.output
COPY --from=builder --chown=bun:bun /app/prisma ./prisma
COPY --from=builder --chown=bun:bun /app/.prisma ./.prisma
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./package.json

USER bun

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=UTC
CMD ["bun", ".output/server/index.mjs"]
