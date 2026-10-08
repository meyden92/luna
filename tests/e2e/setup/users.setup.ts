import { expect, type Page, test as setup } from '@playwright/test';
import { clientIpHeader, type FixtureUser, fixtureUser, fixtureUsers, QUOTA_USER_QUOTA_MIB, storageStatePath } from '../fixtures/users';
import { clickUntil } from '../utils/hydration';
import { signInThroughForm } from '../utils/sign-in';

setup('admin creates the fixture users, which then sign in through the login form', async ({ browser }, testInfo) => {
  setup.setTimeout(3 * 60_000);
  const users = fixtureUsers(testInfo.config.workers);
  const admin = await browser.newContext({ storageState: storageStatePath('admin'), extraHTTPHeaders: clientIpHeader() });
  const page = await admin.newPage();

  await page.goto('/admin/users');
  for (const user of users) await createUser(page, user);

  // The quota user's quota, on its admin detail screen. The field is in GiB.
  const quota = fixtureUser('quota');
  await page.getByRole('link', { name: quota.email }).click();
  await expect(page.getByRole('heading', { name: quota.name })).toBeVisible();
  const quotaField = page.getByLabel('Storage Quota');
  await expect(quotaField).toBeEnabled();
  await quotaField.fill(String(QUOTA_USER_QUOTA_MIB / 1024));
  await page.getByRole('button', { name: 'Save storage quota' }).click();
  await expect(page.getByText('Storage quota updated')).toBeVisible();
  await admin.close();

  // Each in its own context and address: five sign-ins per address per 15 minutes.
  await Promise.all(
    users.map(async (user) => {
      const context = await browser.newContext({ extraHTTPHeaders: clientIpHeader() });
      await signInThroughForm(await context.newPage(), user.username, user.password);
      await context.storageState({ path: storageStatePath(user.role) });
      await context.close();
    }),
  );
});

/** Fills the admin users screen's "Create user" dialog and waits for the confirmation toast. */
async function createUser(page: Page, user: FixtureUser): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Create user' });
  await clickUntil(page.getByRole('button', { name: 'Create user' }), dialog);

  // The form drops a submit fired while the Username availability check is in
  // flight, so let that check answer first.
  const availability = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/is-username-available');
  await dialog.getByLabel('Username').fill(user.username);
  await availability;
  await dialog.getByLabel('Display name').fill(user.name);
  await dialog.getByLabel('Email').fill(user.email);
  await dialog.getByLabel('Initial password').fill(user.password);
  await dialog.getByRole('button', { name: 'Create user' }).click();

  await expect(page.getByText(`${user.name} can now sign in as "${user.username}"`)).toBeVisible();
  await expect(dialog).toBeHidden();
}
