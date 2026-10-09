import { randomBytes } from 'node:crypto';
import { expect, type Request } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { formShare } from '../../../src/db/schema/features';
import { test } from '../fixtures/test';
import { workerRole } from '../fixtures/users';
import { seedFormShare } from '../utils/form-shares';
import { clickUntil } from '../utils/hydration';

// Form shares: a User sends sensitive values through a link, the recipient (no account) claims it and reveals them.
// No screen creates a share (the builder dialog is not mounted anywhere), so shares are seeded with
// `seedFormShare`; everything after that is observed in the browser.
//
// The public claim limit (30 per minute) is keyed on the connection address the app sees, which is the same for the
// whole suite, so these tests run in order in one worker and the rate-limit test goes last.
test.describe.configure({ mode: 'serial' });

const MASKED = '•'.repeat(12);
const unique = (label: string) => `${label}-${randomBytes(3).toString('hex')}`;

test('a recipient opens the link, sees the plain fields and reveals the sensitive one on request', async ({
  page,
  db,
  stack,
}, testInfo) => {
  const title = unique('Server login');
  const secret = `s3cret-${randomBytes(6).toString('hex')}`;
  const id = await seedFormShare(db, stack, workerRole(testInfo.parallelIndex), {
    title,
    fields: [
      { label: 'Username', value: 'deploy-bot' },
      { label: 'Password', value: secret, type: 'password', isSensitive: true },
    ],
  });

  const response = await page.goto(`/form/${id}`);
  expect(response?.status()).toBe(200);
  // What a crawler or a shoulder-surfer gets from the page source: the sensitive value is not in it.
  expect(await response!.text()).not.toContain(secret);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('Username', { exact: true })).toBeVisible();
  await expect(page.getByText('deploy-bot', { exact: true })).toBeVisible();
  await expect(page.getByText('Password', { exact: true })).toBeVisible();
  await expect(page.getByText(MASKED)).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);

  // Revealing is only possible once the view was claimed; the button enables when it was.
  const reveal = page.getByRole('button', { name: 'Reveal' });
  await expect(reveal).toBeEnabled();
  await reveal.click();
  await expect(page.getByText(secret, { exact: true })).toBeVisible();
  await expect(page.getByText(MASKED)).toHaveCount(0);
  await expect(page.getByText(/^\d+s$/)).toBeVisible();

  await page.getByRole('button', { name: 'Hide' }).click();
  await expect(page.getByText(secret)).toHaveCount(0);
  await expect(page.getByText(MASKED)).toBeVisible();
});

test('the owner sees the share in their list, deletes it and the link stops working', async ({
  workerPage,
  browser,
  db,
  stack,
}, testInfo) => {
  const title = unique('Wifi details');
  const id = await seedFormShare(db, stack, workerRole(testInfo.parallelIndex), {
    title,
    fields: [
      { label: 'Network', value: 'guest-net' },
      { label: 'Key', value: 'correct-horse', isSensitive: true },
    ],
    expiresAt: new Date(Date.now() + 24 * 3_600_000),
  });

  await workerPage.goto('/dashboard');
  const dialog = workerPage.getByRole('dialog', { name: 'My Form Shares' });
  await clickUntil(workerPage.getByRole('button', { name: 'Form shares' }), dialog);
  // The innermost block holding both the title and a Delete button is the share's row.
  const row = dialog
    .locator('div')
    .filter({ has: workerPage.getByText(title, { exact: true }) })
    .filter({ has: workerPage.getByRole('button', { name: 'Delete' }) })
    .last();
  await expect(row.getByText('Active', { exact: true })).toBeVisible();
  await expect(row.getByText('2 fields')).toBeVisible();

  const recipient = await browser.newContext();
  const recipientPage = await recipient.newPage();
  await recipientPage.goto(`/form/${id}`);
  await expect(recipientPage.getByRole('heading', { level: 1, name: title })).toBeVisible();

  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(workerPage.getByText('Form share deleted.')).toBeVisible();
  await expect(workerPage.getByText(title, { exact: true })).toHaveCount(0);

  // A new visitor (nothing cached in their tab) finds nothing at the link any more.
  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`/form/${id}`);
  await expect(visitorPage.getByRole('heading', { level: 1, name: 'Share not found' })).toBeVisible();
  await expect(visitorPage.getByText('This link does not exist or has been removed.')).toBeVisible();
  await recipient.close();
  await visitor.close();
});

test('a share that expires after it was opened refuses to reveal and its link reads as expired', async ({
  page,
  browser,
  db,
  stack,
}, testInfo) => {
  const title = unique('Expiring token');
  const secret = `tok-${randomBytes(6).toString('hex')}`;
  const id = await seedFormShare(db, stack, workerRole(testInfo.parallelIndex), {
    title,
    fields: [{ label: 'Token', value: secret, isSensitive: true }],
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  await page.goto(`/form/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(/\d+m \d+s remaining/)).toBeVisible();
  const reveal = page.getByRole('button', { name: 'Reveal' });
  await expect(reveal).toBeEnabled();

  // The builder offers no short expiry, so the deadline passes while the recipient has the page open.
  await db
    .update(formShare)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(eq(formShare.id, id));

  await reveal.click();
  await expect(page.getByText('This share has expired', { exact: true })).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);

  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`/form/${id}`);
  await expect(visitorPage.getByRole('heading', { level: 1, name: 'This share has expired' })).toBeVisible();
  await expect(visitorPage.getByText('The link is no longer available.')).toBeVisible();
  await expect(visitorPage.getByText(secret)).toHaveCount(0);
  await visitor.close();
});

test('a share limited to one view is gone for the second visitor', async ({ browser, db, stack }, testInfo) => {
  const title = unique('One-time code');
  const id = await seedFormShare(db, stack, workerRole(testInfo.parallelIndex), {
    title,
    fields: [{ label: 'Code', value: '123456' }],
    maxViews: 1,
  });

  const first = await browser.newContext();
  const firstPage = await first.newPage();
  await firstPage.goto(`/form/${id}`);
  await expect(firstPage.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(firstPage.getByText('0 views remaining')).toBeVisible();

  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await secondPage.goto(`/form/${id}`);
  await expect(secondPage.getByRole('heading', { level: 1, name: 'This share has expired' })).toBeVisible();
  await expect(secondPage.getByText('The maximum number of views has been reached.')).toBeVisible();
  await expect(secondPage.getByText('123456')).toHaveCount(0);
  await first.close();
  await second.close();
});

test('claims beyond the rate limit are refused and the link will not open', async ({ page, browser, db, stack }, testInfo) => {
  const title = unique('Busy link');
  const id = await seedFormShare(db, stack, workerRole(testInfo.parallelIndex), {
    title,
    fields: [{ label: 'Note', value: 'hello' }],
  });

  // Opening the page calls a few server functions (their ids are hashed, so they cannot be named); capture them all
  // and repeat them, since only the claim is limited to 30 a minute.
  const calls: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/_serverFn/')) calls.push(request);
  });
  await page.goto(`/form/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  expect(calls.length).toBeGreaterThan(0);

  // Some of the 30 may already be spent by the tests above.
  let refused = false;
  for (let attempt = 1; attempt <= 70 && !refused; attempt++) {
    for (const call of calls) {
      const repeat = await page.request.post(call.url(), {
        headers: {
          'x-tsr-serverFn': 'true',
          'content-type': call.headers()['content-type'] ?? 'application/json',
          origin: stack.E2E_BASE_URL,
        },
        data: call.postDataBuffer() ?? '',
      });
      // A refused server function still answers 200; the error travels in the serialized body.
      if ((await repeat.text()).includes('Too many requests')) refused = true;
    }
  }
  expect(refused).toBe(true);

  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`/form/${id}`);
  await expect(visitorPage.getByRole('heading', { level: 1, name: 'Could not open share' })).toBeVisible();
  await expect(visitorPage.getByText('Note', { exact: true })).toHaveCount(0);
  await visitor.close();
});
