import { defineConfig, env } from 'prisma/config';

// Bun loads `.env` automatically before user code runs, so the previous
// `dotenv/config` import is unnecessary — run Prisma via `bunx prisma`.
export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
});
