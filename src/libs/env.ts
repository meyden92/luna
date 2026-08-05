import { z } from 'zod';

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isBase64Encoded32ByteKey(value: string): boolean {
  return BASE64_PATTERN.test(value) && Buffer.from(value, 'base64').length === 32;
}

// Server-only module. Do NOT import from client components.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Public base URL of the CDN. Read at runtime and handed to the browser via
  // the snapshot in libs/runtime-config, so one image serves any domain.
  CDN_URL: z.url(),
  AWS_REGION: z.string().min(1),
  AWS_ENDPOINT: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_BUCKET_NAME: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  REPLICATE_API_TOKEN: z.string().min(1).optional(),
  FORM_FIELD_ENCRYPTION_KEY: z.string().refine(isBase64Encoded32ByteKey, {
    message: 'must be a 32-byte base64-encoded key',
  }),
  RENDITION_SIGNING_SECRET: z.string().min(16).optional(),
  DELIVERY_COOKIE_SECRET: z.string().min(16).optional(),
  ANALYTICS_SALT: z.string().min(16).optional(),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  MAX_SHAREX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(200 * 1024 * 1024),
  SHAREX_UPLOAD_CONCURRENCY: z.coerce.number().int().positive().default(2),
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
