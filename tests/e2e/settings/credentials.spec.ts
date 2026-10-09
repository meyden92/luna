import { randomBytes } from 'node:crypto';
import { type Browser, expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { clientIpHeader, type FixtureUser } from '../fixtures/users';
import { createUserThroughAdmin } from '../utils/admin-users';
import { clickUntil } from '../utils/hydration';
import { signInThroughForm } from '../utils/sign-in';

// Changing a password signs every other device out, so these specs never touch a shared fixture
// user: each creates its own through the admin screen and signs in with fresh sessions.
//
// There is no screen that changes a Username (Settings shows it read-only, "Can't be changed here"),
// so "change the Username and sign in with the new one" has nothing to drive.

/** A user only this test knows, created the way an admin creates one. */
async function createOwnUser(adminPage: Page): Promise<FixtureUser> {
  const tag = randomBytes(3).toString('hex');
  const user: FixtureUser = {
    role: 'worker900',
    username: `e2e-creds-${tag}`,
    name: `Creds ${tag}`,
    // Sorts after every fixture user, so the admin list's first page keeps showing them.
    email: `zz-creds-${tag}@lunashare.test`,
    password: `old-${randomBytes(9).toString('base64url')}`,
  };
  await adminPage.goto('/admin/users');
  await createUserThroughAdmin(adminPage, user);
  return user;
}

/** A page in its own context and address, signed in as `user`. */
async function deviceOf(browser: Browser, user: FixtureUser): Promise<Page> {
  const context = await browser.newContext({ extraHTTPHeaders: clientIpHeader() });
  const page = await context.newPage();
  await signInThroughForm(page, user.username, user.password);
  return page;
}

async function openChangePassword(page: Page) {
  await page.goto('/settings/profile');
  const dialog = page.getByRole('dialog', { name: 'Change password' });
  await clickUntil(page.getByRole('button', { name: 'Change password' }), dialog);
  return dialog;
}

test('changing the password: the old one is refused, the new one works, other devices are signed out', async ({ adminPage, browser }) => {
  const user = await createOwnUser(adminPage);
  const newPassword = `new-${randomBytes(9).toString('base64url')}`;
  const thisDevice = await deviceOf(browser, user);
  const otherDevice = await deviceOf(browser, user);

  const dialog = await openChangePassword(thisDevice);
  await dialog.getByLabel('Current password').fill('not-the-password');
  await dialog.getByLabel('New password').fill(newPassword);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(thisDevice.getByText(/invalid password/i)).toBeVisible();
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Current password').fill(user.password);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(thisDevice.getByText('Password changed — other devices signed out')).toBeVisible();
  await expect(dialog).toBeHidden();

  // The device that changed it stays signed in; the other one is kicked out.
  await thisDevice.reload();
  await expect(thisDevice.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await otherDevice.goto('/settings');
  await expect(otherDevice).toHaveURL(/\/login/);

  // The old password no longer signs in; the new one does.
  const stranger = await (await browser.newContext({ extraHTTPHeaders: clientIpHeader() })).newPage();
  await stranger.goto('/login');
  await expect(stranger.getByRole('button', { name: /^login$/i })).toBeEnabled();
  await stranger.getByLabel('Username').fill(user.username);
  await stranger.getByLabel('Password').fill(user.password);
  const refused = stranger.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/sign-in/username');
  await stranger.getByRole('button', { name: /^login$/i }).click();
  expect((await refused).status()).toBe(401);
  await expect(stranger).toHaveURL(/\/login/);

  await signInThroughForm(stranger, user.username, newPassword);
  await expect(stranger).toHaveURL(/\/dashboard/);

  for (const page of [thisDevice, otherDevice, stranger]) await page.context().close();
});

test('a new password shorter than eight characters is refused before anything is sent', async ({ adminPage, browser }) => {
  const user = await createOwnUser(adminPage);
  const device = await deviceOf(browser, user);

  const dialog = await openChangePassword(device);
  await dialog.getByLabel('Current password').fill(user.password);
  await dialog.getByLabel('New password').fill('short');
  await dialog.getByRole('button', { name: 'Change password' }).click();

  await expect(dialog.getByText('Password must be at least 8 characters')).toBeVisible();
  await expect(dialog).toBeVisible();
  await device.context().close();
});

test('signing out ends the session', async ({ adminPage, browser }) => {
  const user = await createOwnUser(adminPage);
  const device = await deviceOf(browser, user);

  await device.getByRole('button', { name: 'Account' }).click();
  await device.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(device).toHaveURL(/\/login/);

  await device.goto('/settings');
  await expect(device).toHaveURL(/\/login/);
  await device.context().close();
});
