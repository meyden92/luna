/**
 * `bun run test:e2e [-- <playwright args>]`: builds the production image from
 * the working tree, starts it in a disposable Compose stack (Postgres, RustFS,
 * app), bootstraps an admin the way an operator would, runs Playwright against
 * it and removes the stack and its volumes, whether the run passed, failed or
 * was interrupted. The image and the build cache are kept. See ADR 0006.
 *
 * Never reads `.env`: package.json runs this with `bun --no-env-file`, and
 * Compose gets `--env-file /dev/null`. Exits with Playwright's exit code.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { CreateBucketCommand, PutBucketCorsCommand, PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { user } from '../../src/db/schema/auth';
import { S3_REGION, type StackEnv } from '../../tests/e2e/stack-env';

const ROOT = resolve(import.meta.dirname, '../..');
const COMPOSE_FILE = resolve(ROOT, 'docker-compose.e2e.yml');
const PROJECT_PREFIX = 'lunashare-e2e-';
const BUCKET = 'lunashare-e2e';
const ADMIN = { email: 'admin@lunashare.test', username: 'e2eadmin', name: 'E2E Admin' };
const HEALTH_TIMEOUT_MS = 120_000;

/** Carries this runner's PID, so a later sweep can tell a live stack from a leftover. */
const project = `${PROJECT_PREFIX}${process.pid}-${randomBytes(4).toString('hex')}`;

/** The child in the foreground, so a signal can be forwarded to it. */
let current: ReturnType<typeof Bun.spawn> | undefined;

function log(message: string): void {
  console.log(`\x1b[36m[e2e]\x1b[0m ${message}`);
}

/** Runs a command with inherited stdio and resolves with its exit code. */
async function run(cmd: string[], opts: { env?: Record<string, string>; stdin?: string; quiet?: boolean } = {}): Promise<number> {
  const child = Bun.spawn(cmd, {
    cwd: ROOT,
    env: { ...process.env, ...opts.env },
    stdin: opts.stdin === undefined ? 'inherit' : new TextEncoder().encode(opts.stdin),
    stdout: opts.quiet ? 'ignore' : 'inherit',
    stderr: 'inherit',
  });
  current = child;
  const code = await child.exited;
  current = undefined;
  return code;
}

async function runOrThrow(cmd: string[], opts?: Parameters<typeof run>[1]): Promise<void> {
  const code = await run(cmd, opts);
  if (code !== 0) throw new Error(`\`${cmd.join(' ')}\` exited with ${code}`);
}

/** Captures stdout of a short docker query. */
async function output(cmd: string[]): Promise<string> {
  const child = Bun.spawn(cmd, { cwd: ROOT, stdout: 'pipe', stderr: 'inherit' });
  const text = await new Response(child.stdout).text();
  await child.exited;
  return text;
}

/** True while the runner that owns `name` is alive; another run's stack is not a leftover. */
function ownerAlive(name: string): boolean {
  const pid = Number(name.slice(PROJECT_PREFIX.length).split('-')[0]);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * Removes every resource left by an earlier run that never reached its own
 * teardown (`kill -9`, a sleeping laptop), skipping stacks whose runner is still
 * alive. Goes by the Compose project label rather than `docker compose down`,
 * which would need that run's env.
 */
async function sweepLeftovers(): Promise<void> {
  const kinds = [
    { list: ['docker', 'ps', '-a'], id: '{{.ID}}', remove: ['docker', 'rm', '-f', '-v'] },
    { list: ['docker', 'volume', 'ls'], id: '{{.Name}}', remove: ['docker', 'volume', 'rm', '-f'] },
    { list: ['docker', 'network', 'ls'], id: '{{.ID}}', remove: ['docker', 'network', 'rm'] },
  ];
  for (const { list, id: idField, remove } of kinds) {
    const lines = await output([
      ...list,
      '--filter',
      'label=com.docker.compose.project',
      '--format',
      `${idField} {{.Label "com.docker.compose.project"}}`,
    ]);
    const ids = lines
      .split('\n')
      .map((line) => line.trim().split(' '))
      .filter(([id, name]) => id && name?.startsWith(PROJECT_PREFIX) && !ownerAlive(name))
      .map(([id]) => id!);
    if (ids.length > 0) {
      log(`sweeping ${ids.length} leftover ${list[1] === 'ps' ? 'container' : list[1]}(s)`);
      await run([...remove, ...ids], { quiet: true });
    }
  }
}

/** Asks the OS for distinct free ports by binding port 0, then releases them. */
async function freePorts(count: number): Promise<number[]> {
  const servers = await Promise.all(
    Array.from(
      { length: count },
      () =>
        new Promise<ReturnType<typeof createServer>>((done, fail) => {
          const server = createServer();
          server.once('error', fail);
          server.listen(0, '127.0.0.1', () => done(server));
        }),
    ),
  );
  const ports = servers.map((server) => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not read a free port');
    return address.port;
  });
  await Promise.all(servers.map((server) => new Promise((done) => server.close(done))));
  return ports;
}

const secret = (bytes: number) => randomBytes(bytes).toString('hex');

const [appPort, postgresPort, s3Port] = (await freePorts(3)) as [number, number, number];
const baseUrl = `http://localhost:${appPort}`;
const s3Endpoint = `http://127.0.0.1:${s3Port}`;
const databaseUrl = `postgresql://lunashare:lunashare@127.0.0.1:${postgresPort}/lunashare`;
const s3Credentials = { accessKeyId: secret(10), secretAccessKey: secret(20) };
const adminPassword = secret(16);
const formFieldEncryptionKey = randomBytes(32).toString('base64');

/** Interpolated into docker-compose.e2e.yml. */
const composeEnv: Record<string, string> = {
  E2E_APP_PORT: String(appPort),
  E2E_POSTGRES_PORT: String(postgresPort),
  E2E_S3_PORT: String(s3Port),
  E2E_S3_BUCKET: BUCKET,
  E2E_S3_ACCESS_KEY_ID: s3Credentials.accessKeyId,
  E2E_S3_SECRET_ACCESS_KEY: s3Credentials.secretAccessKey,
  E2E_BETTER_AUTH_SECRET: secret(32),
  E2E_FORM_FIELD_ENCRYPTION_KEY: formFieldEncryptionKey,
  E2E_RENDITION_SIGNING_SECRET: secret(32),
  E2E_DELIVERY_COOKIE_SECRET: secret(32),
  E2E_BUILD_COMMIT: (await output(['git', 'rev-parse', 'HEAD'])).trim() || 'unknown',
};

/** Handed to Playwright; read by tests/e2e/stack-env.ts. */
const playwrightEnv: StackEnv = {
  E2E_BASE_URL: baseUrl,
  E2E_DATABASE_URL: databaseUrl,
  E2E_S3_ENDPOINT: s3Endpoint,
  E2E_S3_ACCESS_KEY_ID: s3Credentials.accessKeyId,
  E2E_S3_SECRET_ACCESS_KEY: s3Credentials.secretAccessKey,
  E2E_S3_BUCKET: BUCKET,
  E2E_CDN_URL: `http://host.docker.internal:${s3Port}/${BUCKET}`,
  E2E_ADMIN_EMAIL: ADMIN.email,
  E2E_ADMIN_USERNAME: ADMIN.username,
  E2E_ADMIN_PASSWORD: adminPassword,
  E2E_FORM_FIELD_ENCRYPTION_KEY: formFieldEncryptionKey,
};

const compose = (...args: string[]) => ['docker', 'compose', '--env-file', '/dev/null', '-f', COMPOSE_FILE, '-p', project, ...args];

/**
 * Creates the bucket with an anonymous-read policy (public files are served straight from CDN_URL) and a CORS
 * rule, as production's CDN has: the beautifier draws bucket images on a canvas, which needs `crossOrigin` loads.
 */
async function createBucket(): Promise<void> {
  const s3 = new S3Client({ endpoint: s3Endpoint, region: S3_REGION, forcePathStyle: true, credentials: s3Credentials });
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  // RustFS ignores per-object public-read, so this also exposes private objects
  // at their raw bucket URL. Specs assert privacy at the app's surfaces only.
  const policy = {
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${BUCKET}/*`] }],
  };
  await s3.send(new PutBucketPolicyCommand({ Bucket: BUCKET, Policy: JSON.stringify(policy) }));
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: { CORSRules: [{ AllowedOrigins: ['*'], AllowedMethods: ['GET', 'HEAD'], AllowedHeaders: ['*'] }] },
    }),
  );
  s3.destroy();
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet: the entrypoint is still migrating.
    }
    await Bun.sleep(500);
  }
  await run(compose('logs', 'app'));
  throw new Error(`${baseUrl}/api/health did not answer within ${HEALTH_TIMEOUT_MS / 1000}s`);
}

/**
 * The operator's first-run path: a User row with no credential Account, then
 * `auth:set-credentials` inside the app container with the answers piped in.
 */
async function bootstrapAdmin(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  await drizzle({ client: pool })
    .insert(user)
    .values({ id: randomUUID(), email: ADMIN.email, name: ADMIN.name, isSuperAdmin: true, active: true, emailVerified: true });
  await pool.end();
  await runOrThrow(compose('exec', '-T', 'app', 'bun', 'scripts/auth/set-credentials.ts', ADMIN.email), {
    env: composeEnv,
    stdin: `${ADMIN.username}\n${adminPassword}\n${adminPassword}\n`,
    quiet: true,
  });
}

let teardown: Promise<void> | undefined;

/** Idempotent: the main flow and a signal handler may both ask for it. */
function tearDown(): Promise<void> {
  teardown ??= (async () => {
    log(`teardown: removing ${project} and its volumes`);
    await run(compose('down', '-v', '--remove-orphans'), { env: composeEnv, quiet: true });
  })();
  return teardown;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    log(`${signal} received`);
    // Once teardown runs, `current` is `compose down` itself: let it finish.
    if (!teardown) current?.kill(signal);
    await tearDown();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

let exitCode = 1;
try {
  log('sweeping leftover stacks');
  await sweepLeftovers();

  log(`build: lunashare:e2e from the working tree (project ${project})`);
  await runOrThrow(compose('build', 'app'), { env: composeEnv });

  log('start: postgres and rustfs');
  await runOrThrow(compose('up', '-d', '--wait', 'postgres', 'rustfs'), { env: composeEnv });
  await createBucket();

  log('migrate: starting the app, whose entrypoint applies the migrations');
  await runOrThrow(compose('up', '-d', '--no-build', 'app'), { env: composeEnv });
  await waitForHealth();

  log('seed: bootstrapping the admin through auth:set-credentials');
  await bootstrapAdmin();

  log(`stack up\n  app       ${baseUrl}\n  postgres  ${databaseUrl}\n  rustfs    ${s3Endpoint} (bucket ${BUCKET})`);
  log(`test: playwright test ${process.argv.slice(2).join(' ')}`);
  exitCode = await run(['bunx', 'playwright', 'test', ...process.argv.slice(2)], { env: playwrightEnv });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  await tearDown();
}
log(`done (exit ${exitCode})`);
process.exit(exitCode);
