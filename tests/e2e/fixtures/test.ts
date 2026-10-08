import { S3Client } from '@aws-sdk/client-s3';
import { type APIRequestContext, type Browser, test as base, type Page, type PlaywrightWorkerArgs } from '@playwright/test';
import { S3_REGION, type StackEnv, stackEnv } from '../stack-env';
import { createTestDb, type TestDb } from './db';
import { clientIpHeader, type Role, storageStatePath } from './users';

type TestFixtures = {
  /** A page signed in as the bootstrap admin, with its own `cf-connecting-ip`. */
  adminPage: Page;
  /** API calls as the bootstrap admin, with its own `cf-connecting-ip`. */
  adminRequest: APIRequestContext;
};

type WorkerFixtures = {
  stack: StackEnv;
  /** S3 client on the stack's RustFS, for head, get and list. */
  bucket: { client: S3Client; name: string };
  /** See `createTestDb`: reads, and backdating `file.created_at` only. */
  db: TestDb;
};

/**
 * A page in its own context, loaded with the role's stored session and a
 * distinct `cf-connecting-ip`. Project `use` options (base URL, locale,
 * timezone) still apply: the test runner merges them into `newContext`.
 */
async function withRolePage(browser: Browser, role: Role, use: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext({ storageState: storageStatePath(role), extraHTTPHeaders: clientIpHeader() });
  await use(await context.newPage());
  await context.close();
}

/** The API counterpart of `withRolePage`. */
async function withRoleRequest(
  playwright: PlaywrightWorkerArgs['playwright'],
  baseURL: string,
  role: Role,
  use: (request: APIRequestContext) => Promise<void>,
): Promise<void> {
  const request = await playwright.request.newContext({
    baseURL,
    storageState: storageStatePath(role),
    extraHTTPHeaders: clientIpHeader(),
  });
  await use(request);
  await request.dispose();
}

/** The suite's `test`. Every spec imports this instead of Playwright's. */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // The built-in `page`, `context` and `request` get a fresh address per test too.
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring pattern.
  extraHTTPHeaders: async ({}, use) => use(clientIpHeader()),

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring pattern.
  stack: [async ({}, use) => use(stackEnv()), { scope: 'worker' }],

  bucket: [
    async ({ stack }, use) => {
      const client = new S3Client({
        endpoint: stack.E2E_S3_ENDPOINT,
        region: S3_REGION,
        forcePathStyle: true,
        credentials: { accessKeyId: stack.E2E_S3_ACCESS_KEY_ID, secretAccessKey: stack.E2E_S3_SECRET_ACCESS_KEY },
      });
      await use({ client, name: stack.E2E_S3_BUCKET });
      client.destroy();
    },
    { scope: 'worker' },
  ],

  db: [
    async ({ stack }, use) => {
      const { db, close } = createTestDb(stack.E2E_DATABASE_URL);
      await use(db);
      await close();
    },
    { scope: 'worker' },
  ],

  adminPage: async ({ browser }, use) => withRolePage(browser, 'admin', use),
  adminRequest: async ({ playwright, stack }, use) => withRoleRequest(playwright, stack.E2E_BASE_URL, 'admin', use),
});
