/**
 * Captures full-page screenshots of the main routes in both Appearances so the
 * owner can compare the app before and after a styling change (epic #64).
 *
 *   bun scripts/screenshots/capture.ts before   # against main
 *   bun scripts/screenshots/capture.ts after    # against the finished branch
 *
 * Needs the dev server on http://localhost:3000 (or PLAYWRIGHT_BASE_URL) and the
 * same DATABASE_URL / BETTER_AUTH_SECRET the Playwright suite uses: the admin
 * session is minted by the e2e global setup. Output lands in
 * .scratch/screenshots/<label>/, which is gitignored; nothing here is a test.
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { and, desc, eq } from 'drizzle-orm';
import { formShare } from '../../src/db/schema/features';
import { file, snippet } from '../../src/db/schema/files';
import globalSetup from '../../tests/e2e/global-setup';
import { disconnectTestDb, getTestDb } from '../../tests/e2e/utils/db';

const label = process.argv[2];
if (!label) {
  console.error('usage: bun scripts/screenshots/capture.ts <label>');
  process.exit(1);
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = resolve(import.meta.dirname, '../../.scratch/screenshots', label);

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

/** First public file, snippet and form share, so the share pages have real content. */
async function findShareRoutes(): Promise<string[]> {
  const db = getTestDb();
  const routes: string[] = [];
  const [f] = await db
    .select({ id: file.id })
    .from(file)
    .where(and(eq(file.private, false), eq(file.isDeleted, false)))
    .orderBy(desc(file.createdAt))
    .limit(1);
  if (f) routes.push(`/view/${f.id}`, `/embed/${f.id}`);
  const [s] = await db
    .select({ id: snippet.id })
    .from(snippet)
    .where(and(eq(snippet.isPublic, true), eq(snippet.isDeleted, false)))
    .orderBy(desc(snippet.createdAt))
    .limit(1);
  if (s) routes.push(`/bin/${s.id}`);
  const [fs] = await db
    .select({ id: formShare.id })
    .from(formShare)
    .where(eq(formShare.isDeleted, false))
    .orderBy(desc(formShare.createdAt))
    .limit(1);
  if (fs) routes.push(`/form/${fs.id}`);
  return routes;
}

function fileNameFor(route: string, scheme: string): string {
  const slug = route === '/' ? 'landing' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-');
  return `${slug}--${scheme}.png`;
}

await globalSetup();
const shareRoutes = await findShareRoutes();
await disconnectTestDb();
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
for (const colorScheme of ['light', 'dark'] as const) {
  const jobs: Array<{ routes: string[]; storageState?: string }> = [
    { routes: [...PUBLIC_ROUTES, ...shareRoutes] },
    { routes: AUTHED_ROUTES, storageState: process.env.E2E_ADMIN_STORAGE },
  ];
  for (const job of jobs) {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      colorScheme,
      viewport: { width: 1440, height: 900 },
      storageState: job.storageState,
    });
    const page = await context.newPage();
    for (const route of job.routes) {
      try {
        await page.goto(route, { waitUntil: 'networkidle', timeout: 30_000 });
        // Let entrance animations settle before the capture.
        await page.waitForTimeout(1_200);
        await page.screenshot({ path: resolve(OUT_DIR, fileNameFor(route, colorScheme)), fullPage: true });
        console.log(`captured ${route} (${colorScheme})`);
      } catch (error) {
        console.warn(`skipped ${route} (${colorScheme}): ${(error as Error).message.split('\n')[0]}`);
      }
    }
    await context.close();
  }
}
await browser.close();
console.log(`screenshots written to ${OUT_DIR}`);
