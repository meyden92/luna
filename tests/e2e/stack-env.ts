/**
 * The disposable stack as the suite sees it. `scripts/e2e/run.ts` starts the
 * stack and hands its details to Playwright through these variables; the config
 * and the fixtures read them through `stackEnv()`, never anything else, so the
 * suite cannot drift onto the dev database or dev server.
 */
export const STACK_ENV_KEYS = [
  /** App origin, `http://localhost:<port>`. */
  'E2E_BASE_URL',
  /** Postgres on its published port, for the `db` fixture. */
  'E2E_DATABASE_URL',
  /** RustFS on its published port, reachable from the test process. */
  'E2E_S3_ENDPOINT',
  'E2E_S3_ACCESS_KEY_ID',
  'E2E_S3_SECRET_ACCESS_KEY',
  'E2E_S3_BUCKET',
  /** The app's CDN_URL: `http://host.docker.internal:<port>/<bucket>`. Only the browser can resolve it. */
  'E2E_CDN_URL',
  /** The bootstrap admin, created by the wrapper through `auth:set-credentials`. */
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_USERNAME',
  'E2E_ADMIN_PASSWORD',
] as const;

export type StackEnvKey = (typeof STACK_ENV_KEYS)[number];
export type StackEnv = Record<StackEnvKey, string>;

/** RustFS ignores the region, but the S3 client needs one; matches the app's AWS_REGION. */
export const S3_REGION = 'us-east-1';

/** Reads the stack's variables, throwing if the suite was not started by `bun run test:e2e`. */
export function stackEnv(): StackEnv {
  const missing = STACK_ENV_KEYS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')}. The e2e suite runs only against the disposable stack: start it with \`bun run test:e2e\`.`,
    );
  }
  return Object.fromEntries(STACK_ENV_KEYS.map((key) => [key, process.env[key]!])) as StackEnv;
}
