import { z } from 'zod';

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isBase64Encoded32ByteKey(value: string): boolean {
  return BASE64_PATTERN.test(value) && Buffer.from(value, 'base64').length === 32;
}

// Server-only module. Do NOT import from client components.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Deployment config and secrets that the Vault also accepts are read through
  // `getConfig` (src/libs/vault/vault.ts), never from here.
  // fal hosts, overridden only by the E2E stack to reach its fake fal service.
  FAL_QUEUE_BASE_URL: z.url().default('https://queue.fal.run'),
  FAL_REST_BASE_URL: z.url().default('https://rest.fal.ai'),
  FAL_API_BASE_URL: z.url().default('https://api.fal.ai/v1'),
  FORM_FIELD_ENCRYPTION_KEY: z.string().refine(isBase64Encoded32ByteKey, {
    message: 'must be a 32-byte base64-encoded key',
  }),
  // The release tag (e.g. v4.6.0) the image was built from; unset or empty in dev.
  BUILD_VERSION: z.string().optional(),
  BUILD_COMMIT: z.string().optional(),
  BUILD_TIME: z.string().optional(),
  PUBLIC_BASE_URL: z.url().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid or missing environment variables:\n${details}`);
  }
  return result.data;
}

// Lazy validation on first property access so importing this module never
// evaluates process.env at build time (matches the lazy pattern in prismadb.ts).
export const env: Env = new Proxy({} as Env, {
  get(_, prop) {
    cached ??= validateEnv();
    return cached[prop as keyof Env];
  },
});
