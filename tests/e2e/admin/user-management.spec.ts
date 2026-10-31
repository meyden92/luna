import { randomBytes } from 'node:crypto';
import { type Browser, expect, type Page } from '@playwright/test';
import { formatSize } from '../../../src/libs/utils';
import { test } from '../fixtures/test';
import { clientIpHeader, type FixtureUser } from '../fixtures/users';
import { createUserThroughAdmin, signedInDevice, throwawayUser, userIdOf } from '../utils/admin-users';
import { clickUntil } from '../utils/hydration';
import { uniquePrefix, uploadOwnFiles } from '../utils/own-files';
import { bucketKeysContaining } from '../utils/uploads';

// Every test creates its own user, so suspending, resetting or deleting one never touches a fixture user.

/** Creates a throwaway user through the admin screen and opens its detail page. Returns the user and its id. */
async function createAndOpen(
  adminPage: Page,
  db: Parameters<typeof userIdOf>[0],
  label: string,
): Promise<{ account: FixtureUser; id: string }> {
  const account = throwawayUser(label);
  await adminPage.goto('/admin/users');
  await createUserThroughAdmin(adminPage, account);
  const id = await userIdOf(db, account.email);
  await adminPage.goto(`/admin/users/${id}`);
  await expect(adminPage.getByRole('heading', { name: account.name })).toBeVisible();
  return { account, id };
}

/** Submits the login form from a fresh address and returns the HTTP status of the sign-in call. */
async function signInStatus(browser: Browser, username: string, password: string): Promise<number> {
  const context = await browser.newContext({ extraHTTPHeaders: clientIpHeader() });
  const page = await context.newPage();
  await page.goto('/login');
  const submit = page.getByRole('button', { name: /^login$/i });
  await expect(submit).toBeEnabled();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  const answer = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/sign-in/username');
  await submit.click();
  const status = (await answer).status();
  if (status !== 200) await expect(page).toHaveURL(/\/login/);
  await context.close();
  return status;
}

test('a created user is listed, found by search and can sign in', async ({ adminPage, browser, db }) => {
  const { account, id } = await createAndOpen(adminPage, db, 'created');

  await expect(adminPage).toHaveTitle('User | LunaShare');
  await expect(adminPage.getByRole('paragraph').filter({ hasText: account.email })).toBeVisible();
  await expect(adminPage.getByText('Active', { exact: true })).toBeVisible();
  await expect(adminPage.getByTitle(id)).toBeVisible();

  await adminPage.goto('/admin/users');
  await adminPage.getByPlaceholder('Search users').fill(account.email);
  await adminPage.getByRole('button', { name: 'Search' }).click();
  await expect(adminPage.getByRole('link', { name: account.email })).toBeVisible();
  await expect(adminPage.getByText('Showing 1-1 of 1 users')).toBeVisible();

  const device = await signedInDevice(browser, account);
  await expect(device).toHaveURL(/\/dashboard/);
});

test('resetting the password: the old one is refused, the new one works, the old session is signed out', async ({
  adminPage,
  browser,
  db,
}) => {
  const { account } = await createAndOpen(adminPage, db, 'reset');
  const device = await signedInDevice(browser, account);
  const newPassword = `new-${randomBytes(9).toString('base64url')}`;

  const dialog = adminPage.getByRole('dialog', { name: 'Reset password' });
  await clickUntil(adminPage.getByRole('button', { name: 'Reset password' }), dialog);
  await dialog.getByLabel('New password').fill(newPassword);
  await dialog.getByRole('button', { name: 'Reset password' }).click();
  await expect(adminPage.getByText(`Password reset. ${account.name} has been signed out everywhere.`)).toBeVisible();

  await device.goto('/settings');
  await expect(device).toHaveURL(/\/login/);
  expect(await signInStatus(browser, account.username, account.password)).toBe(401);
  expect(await signInStatus(browser, account.username, newPassword)).toBe(200);
});

test('changing the quota shows on the user list and on the storage page of the user', async ({ adminPage, browser, db }) => {
  const { account } = await createAndOpen(adminPage, db, 'quota');
  const quotaBytes = 512 * 1024 * 1024;

  const input = adminPage.getByLabel('Storage Quota');
  const toast = adminPage.getByText('Storage quota updated');
  await expect(async () => {
    await input.fill('0.5');
    await adminPage.getByRole('button', { name: 'Save storage quota' }).click();
    await expect(toast).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });

  await adminPage.reload();
  await expect(input).toHaveValue('0.5');
  await expect(adminPage.getByText(`0 B / ${formatSize(quotaBytes)}`)).toBeVisible();

  const device = await signedInDevice(browser, account);
  await device.goto('/settings/storage');
  await expect(device.getByText(`of ${formatSize(quotaBytes, { trim: true })} used`)).toBeVisible();

  await adminPage.goto('/admin/users');
  await adminPage.getByPlaceholder('Search users').fill(account.email);
  await adminPage.getByRole('button', { name: 'Search' }).click();
  await expect(adminPage.getByRole('row', { name: new RegExp(account.email) })).toContainText(`0 B / ${formatSize(quotaBytes)}`);
});

test('adding a user to the Admin group opens /admin for it, removing it closes /admin again', async ({ adminPage, browser, db }) => {
  const { account } = await createAndOpen(adminPage, db, 'rbac');
  const device = await signedInDevice(browser, account);

  await device.goto('/admin');
  await expect(device).toHaveURL(/\/unauthorized/);

  const adminGroup = adminPage.getByRole('checkbox', { name: /^Admin/ });
  const save = adminPage.getByRole('button', { name: 'Save Group Assignments' });
  await expect(adminGroup).not.toBeChecked();
  await adminGroup.check();
  await save.click();
  await expect(adminPage.getByText('User groups updated')).toBeVisible();
  await expect(adminGroup).toBeChecked();

  await device.goto('/admin');
  await expect(device).toHaveURL(/\/admin$/);
  await expect(device.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

  await adminGroup.uncheck();
  // The first save's toast can still be on screen, so it proves nothing here.
  // Wait for the revoke itself to commit before the device asks for /admin.
  const revoked = adminPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/_serverFn/'));
  await save.click();
  expect((await revoked).ok()).toBe(true);
  await expect(adminGroup).not.toBeChecked();

  await device.goto('/admin');
  await expect(device).toHaveURL(/\/unauthorized/);
});

test('suspending refuses sign-in and ends the open session; reactivating restores both', async ({ adminPage, browser, db }) => {
  const { account } = await createAndOpen(adminPage, db, 'suspend');
  const device = await signedInDevice(browser, account);

  const suspend = adminPage.getByRole('button', { name: 'Suspend Account' });
  const confirm = adminPage.getByRole('dialog', { name: 'Suspend User' });
  await clickUntil(suspend, confirm);
  await expect(confirm.getByText('Are you sure you want to suspend this user?')).toBeVisible();
  await confirm.getByRole('button', { name: 'Confirm' }).click();
  await expect(adminPage.getByText('User suspended successfully')).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Reactivate Account' })).toBeVisible();

  await device.goto('/settings');
  await expect(device).toHaveURL(/\/login/);
  expect(await signInStatus(browser, account.username, account.password)).toBe(403);

  const reactivate = adminPage.getByRole('button', { name: 'Reactivate Account' });
  const reconfirm = adminPage.getByRole('dialog', { name: 'Reactivate User' });
  await clickUntil(reactivate, reconfirm);
  await reconfirm.getByRole('button', { name: 'Confirm' }).click();
  await expect(adminPage.getByText('User reactivated successfully')).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Suspend Account' })).toBeVisible();

  expect(await signInStatus(browser, account.username, account.password)).toBe(200);
});

test('deleting a user removes it from the list, deletes its files and refuses its sign-in', async ({
  adminPage,
  browser,
  bucket,
  corpus,
  db,
}) => {
  const { account, id } = await createAndOpen(adminPage, db, 'delete');
  const device = await signedInDevice(browser, account);
  const prefix = uniquePrefix('delete-me');
  await uploadOwnFiles(device.request, prefix, [corpus.file('notes.txt')]);
  expect(await bucketKeysContaining(bucket, id, '')).toHaveLength(1);

  const open = adminPage.getByRole('button', { name: 'Delete User Account' });
  const dialog = adminPage.getByRole('dialog', { name: `Delete ${account.email}` });
  await clickUntil(open, dialog);
  const confirm = dialog.getByRole('button', { name: 'Delete account' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(`Type ${account.email} to confirm.`).fill(account.email);
  await confirm.click();
  await expect(adminPage).toHaveURL(/\/admin\/users(\?|$)/);

  await adminPage.getByPlaceholder('Search users').fill(account.email);
  await adminPage.getByRole('button', { name: 'Search' }).click();
  await expect(adminPage.getByText('No users found.')).toBeVisible();
  expect(await bucketKeysContaining(bucket, id, '')).toHaveLength(0);

  expect(await signInStatus(browser, account.username, account.password)).toBe(403);
});
