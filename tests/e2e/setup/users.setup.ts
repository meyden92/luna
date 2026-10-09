import { expect, test as setup } from '@playwright/test';
import { clientIpHeader, fixtureUser, fixtureUsers, QUOTA_USER_QUOTA_MIB, storageStatePath } from '../fixtures/users';
import { createUserThroughAdmin as createUser } from '../utils/admin-users';
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
