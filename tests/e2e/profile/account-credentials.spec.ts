import { expect } from '@playwright/test';
import sharp from 'sharp';
import { test } from '../fixtures/auth';
import { TEST_EMAIL_DOMAIN, TEST_USER_USERNAME } from '../utils/db';
import { clickUntil } from '../utils/hydration';
import { signIn } from '../utils/sign-in';

/**
 * Self-service credentials and Avatar, through the real interface.
 *
 * Every mutation is either idempotent or performed on a User the test creates
 * for itself: the sign-in specs depend on the shared fixtures' credentials, and
 * Playwright runs files in parallel.
 */

const ACCOUNT_URL = '/settings/account';

/**
 * Types a Username and waits for the availability check to answer, which the
 * form requires before it will accept a submit.
 */
async function fillUsername(page: import('@playwright/test').Page, label: string, value: string) {
  const answered = page.waitForResponse((r) => r.url().includes('is-username-available'), { timeout: 15_000 }).catch(() => null);
  await page.getByLabel(label).fill(value);
  await answered;
}

/** A throwaway identity, unique per run so parallel workers cannot collide. */
function throwaway() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    username: `e2etmp${suffix}`,
    name: `Temp ${suffix}`,
    email: `e2e-tmp-${suffix}@${TEST_EMAIL_DOMAIN}`,
    password: 'first-password-9',
  };
}

test.describe('Avatar', () => {
  test('an uploaded image becomes the avatar', async ({ authenticatedPage: page }) => {
    const image = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 10, g: 120, b: 200 } } })
      .png()
      .toBuffer();

    await page.goto(ACCOUNT_URL);
    await page.getByTestId('avatar-input').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: image });

    await expect(page.getByText(/avatar updated/i)).toBeVisible();
    // Whatever went in, what comes back is the normalised WebP.
    await expect(page.locator('img[src*="static/avatar/"]').first()).toBeVisible();
  });

  test('a file that is not an image is refused', async ({ authenticatedPage: page }) => {
    await page.goto(ACCOUNT_URL);
    await page
      .getByTestId('avatar-input')
      .setInputFiles({ name: 'not-an-image.txt', mimeType: 'image/png', buffer: Buffer.from('definitely not a png') });

    await expect(page.getByText(/not an image we can read/i)).toBeVisible();
  });
});

test.describe('Credentials', () => {
  test('an administrator creates a User who can then sign in and change their own password', async ({ adminPage, browser }) => {
    const created = throwaway();

    await adminPage.goto('/admin/users');
    await clickUntil(adminPage.getByRole('button', { name: /create user/i }), adminPage.getByLabel('Initial password'));

    await fillUsername(adminPage, 'Username', created.username);
    await adminPage.getByLabel('Display name').fill(created.name);
    await adminPage.getByLabel('Email').fill(created.email);
    await adminPage.getByLabel('Initial password').fill(created.password);
    await adminPage
      .getByRole('button', { name: /^create user$/i })
      .last()
      .click();

    await expect(adminPage.getByText(new RegExp(`can now sign in as "${created.username}"`, 'i'))).toBeVisible();

    // A fresh context: the new User has no session, exactly like a real one.
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');
    await signIn(page, created.username, created.password);
    await expect(page).toHaveURL(/\/dashboard/);

    const newPassword = 'second-password-9';
    await page.goto(ACCOUNT_URL);
    await page.getByLabel('Current password').fill(created.password);
    await page.getByLabel('New password').fill(newPassword);
    await page.getByRole('button', { name: /change password/i }).click();
    await expect(page.getByText(/password changed/i)).toBeVisible();

    // The old password must stop working and the new one must start.
    const after = await browser.newContext();
    const afterPage = await after.newPage();

    await afterPage.goto('/login');
    await signIn(afterPage, created.username, created.password);
    await expect(afterPage.getByText(/invalid username or password/i)).toBeVisible();

    await signIn(afterPage, created.username, newPassword);
    await expect(afterPage).toHaveURL(/\/dashboard/);

    await context.close();
    await after.close();
  });

  test('a Username already held by someone else is rejected', async ({ adminPage, browser }) => {
    const created = throwaway();

    await adminPage.goto('/admin/users');
    await clickUntil(adminPage.getByRole('button', { name: /create user/i }), adminPage.getByLabel('Initial password'));
    await fillUsername(adminPage, 'Username', created.username);
    await adminPage.getByLabel('Display name').fill(created.name);
    await adminPage.getByLabel('Email').fill(created.email);
    await adminPage.getByLabel('Initial password').fill(created.password);
    await adminPage
      .getByRole('button', { name: /^create user$/i })
      .last()
      .click();
    await expect(adminPage.getByText(/can now sign in as/i)).toBeVisible();

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');
    await signIn(page, created.username, created.password);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto(ACCOUNT_URL);
    await fillUsername(page, 'Username', TEST_USER_USERNAME);

    // Told while typing, not after submitting: the field itself refuses before
    // the form is ever sent.
    await expect(page.getByText(/already taken/i)).toBeVisible();

    await context.close();
  });

  test('an administrator resets a password, and the old one stops working', async ({ adminPage, browser }) => {
    const created = throwaway();

    await adminPage.goto('/admin/users');
    await clickUntil(adminPage.getByRole('button', { name: /create user/i }), adminPage.getByLabel('Initial password'));
    await fillUsername(adminPage, 'Username', created.username);
    await adminPage.getByLabel('Display name').fill(created.name);
    await adminPage.getByLabel('Email').fill(created.email);
    await adminPage.getByLabel('Initial password').fill(created.password);
    await adminPage
      .getByRole('button', { name: /^create user$/i })
      .last()
      .click();
    await expect(adminPage.getByText(new RegExp(`can now sign in as "${created.username}"`, 'i'))).toBeVisible();

    // Reach the new User's detail page through the admin list.
    await adminPage.goto('/admin/users?search=' + encodeURIComponent(created.email));
    await adminPage.getByRole('link', { name: created.email }).first().click();

    const reset = 'reset-password-9';
    await clickUntil(adminPage.getByRole('button', { name: /reset password/i }), adminPage.getByLabel('New password'));
    await adminPage.getByLabel('New password').fill(reset);
    await adminPage
      .getByRole('button', { name: /^reset password$/i })
      .last()
      .click();
    await expect(adminPage.getByText(/password reset/i)).toBeVisible();

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');
    await signIn(page, created.username, created.password);
    await expect(page.getByText(/invalid username or password/i)).toBeVisible();

    await signIn(page, created.username, reset);
    await expect(page).toHaveURL(/\/dashboard/);

    await context.close();
  });
});
