FROM node:25-alpine AS base
RUN npm install -g corepack --force && corepack enable

FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then pnpm i --frozen-lockfile --ignore-scripts=false; \
    else echo "Lockfile not found." && exit 1; \
    fi

COPY prisma ./prisma

RUN set -e; \
    for attempt in 1 2 3; do \
      if [ -f pnpm-lock.yaml ]; then pnpm prisma generate && break; \
      elif [ -f yarn.lock ]; then yarn prisma generate && break; \
      elif [ -f package-lock.json ]; then npx prisma generate && break; \
      else echo "Lockfile not found." && exit 1; \
      fi; \
      echo "Attempt $attempt failed, retrying in 5s..."; sleep 5; \
    done

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.prisma ./.prisma
COPY . .
COPY --from=deps /app/prisma ./prisma

ARG VITE_PUBLIC_CDN_URL
ARG VITE_PUBLIC_SERVER_URL
ARG BUILD_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV VITE_PUBLIC_CDN_URL=$VITE_PUBLIC_CDN_URL
ENV VITE_PUBLIC_SERVER_URL=$VITE_PUBLIC_SERVER_URL
ENV BUILD_COMMIT=$BUILD_COMMIT
ENV BUILD_TIME=$BUILD_TIME

RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

ARG BUILD_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV BUILD_COMMIT=$BUILD_COMMIT
ENV BUILD_TIME=$BUILD_TIME

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs-user

COPY --from=builder --chown=nodejs-user:nodejs /app/.output ./.output
COPY --from=builder --chown=nodejs-user:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs-user:nodejs /app/.prisma ./.prisma
COPY --from=builder --chown=nodejs-user:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs-user:nodejs /app/package.json ./package.json

USER nodejs-user

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=UTC
CMD ["node", ".output/server/index.mjs"]
