import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Bun's automatic `.env` loading does not reach this file: the Prisma CLI
// evaluates the config in its own process, which never inherits it. dotenv is
// required here even under Bun.
export default defineConfig({
  datasource: {
    url: env('DATABASE_URL'),
  },
});
