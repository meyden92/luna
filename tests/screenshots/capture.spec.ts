import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { user } from '../../src/db/schema/auth';
import { snippet } from '../../src/db/schema/files';
import { test } from '../e2e/fixtures/test';
import { clientIpHeader, fixtureUser, storageStatePath, workerRole } from '../e2e/fixtures/users';
import { seedFormShare } from '../e2e/utils/form-shares';
import { uniquePrefix, uploadOwnFiles } from '../e2e/utils/own-files';

/** Routes that render the same for everyone. */
const PUBLIC_ROUTES = ['/', '/login', '/unauthorized', '/this-route-does-not-exist', '/privacy'];

/** Routes that need the admin session. */
const AUTHED_ROUTES = [
  '/dashboard',
  '/bin',
  '/settings',
  '/settings/account',
  '/ai/generate',
  '/tools/rauchen',
  '/admin',
  '/admin/users',
  '/admin/tasks',
  '/admin/audit',
  '/admin/templates',
];

function fileNameFor(route: string, scheme: string): string {
  const slug = route === '/' ? 'landing' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-');
  return `${slug}--${scheme}.png`;
}

/**
 * Not a test: captures the pages below in both Appearances for before/after styling comparisons.
 * Run it with `bun run screenshots <label>`, which starts the disposable stack (`playwright.screenshots.config.ts`).
 */
test('capture screenshots', async ({ browser, workerRequest, db, stack, corpus }, testInfo) => {
  const label = process.env.SCREENSHOT_LABEL;
  if (!label) throw new Error('SCREENSHOT_LABEL is not set: run `bun run screenshots <label>`');
  const outDir = resolve(import.meta.dirname, '../../.scratch/screenshots', label);
  test.setTimeout(10 * 60_000);

  // Something real behind each share page: a public file, a public paste and a form share, all the worker user's.
  const [shared] = await uploadOwnFiles(workerRequest, uniquePrefix('shot'), [corpus.file('forest-path.jpg')]);
  const role = workerRole(testInfo.parallelIndex);
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, fixtureUser(role).username));
  if (!shared || !owner) throw new Error('Could not seed the share pages');
  const snippetId = randomUUID();
  await db.insert(snippet).values({
    id: snippetId,
    title: 'Screenshot snippet',
    content: 'const answer = 42;\nconsole.log(answer);',
    language: 'javascript',
    isPublic: true,
    ownerId: owner.id,
  });
  const formId = await seedFormShare(db, stack, role, {
    title: 'Screenshot form',
    fields: [
      { label: 'Server', value: 'example.test' },
      { label: 'Password', value: 'not-a-real-secret', type: 'password', isSensitive: true },
    ],
  });
  const shareRoutes = [`/view/${shared.id}`, `/embed/${shared.id}`, `/bin/${snippetId}`, `/form/${formId}`];

  await mkdir(outDir, { recursive: true });
  const skipped: string[] = [];
  let captured = 0;
  for (const colorScheme of ['light', 'dark'] as const) {
    const jobs: Array<{ routes: string[]; storageState?: string }> = [
      { routes: [...PUBLIC_ROUTES, ...shareRoutes] },
      { routes: AUTHED_ROUTES, storageState: storageStatePath('admin') },
    ];
    for (const job of jobs) {
      const context = await browser.newContext({
        colorScheme,
        viewport: { width: 1440, height: 900 },
        storageState: job.storageState,
        extraHTTPHeaders: clientIpHeader(),
      });
      const page = await context.newPage();
      for (const route of job.routes) {
        try {
          await page.goto(route, { waitUntil: 'networkidle', timeout: 30_000 });
          // Let entrance animations settle before the capture.
          await page.waitForTimeout(1_200);
          await page.screenshot({ path: resolve(outDir, fileNameFor(route, colorScheme)), fullPage: true });
          captured++;
        } catch (error) {
          skipped.push(`${route} (${colorScheme}): ${(error as Error).message.split('\n')[0]}`);
        }
      }
      await context.close();
    }
  }
  console.log(`${captured} screenshots written to ${outDir}`);
  if (skipped.length > 0) throw new Error(`Could not capture:\n${skipped.join('\n')}`);
});
