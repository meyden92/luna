import { expect, test } from '@playwright/test';
import { TEST_PASSWORD, TEST_USER_USERNAME } from '../utils/db';
import { signIn } from '../utils/sign-in';

/**
 * Sign-in, through the real form. Every other suite starts from a forged
 * session cookie instead, so this is the only place the door itself is tried.
 *
 * The throttle on repeated attempts is deliberately not asserted: the limiter is
 * keyed on IP and path, and every request here shares one address.
 */

test.describe('Login flow', () => {
  test('login page asks for a username and password', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /^login$/i })).toBeVisible();
    await expect(page.getByText(/welcome back to/i)).toBeVisible();
  });

  test('unauthenticated dashboard access redirects to /login', async ({ page }) => {
    const response = await page.goto('/dashboard');
    expect(response?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test('valid credentials reach the dashboard', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, TEST_USER_USERNAME, TEST_PASSWORD);

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('a wrong password is refused without saying which half was wrong', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, TEST_USER_USERNAME, 'not-the-right-password');

    await expect(page.getByText(/invalid username or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('an unknown username is refused with the same message, so accounts cannot be enumerated', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, 'nobody-by-that-name', TEST_PASSWORD);

    await expect(page.getByText(/invalid username or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('signing in returns to the page that was asked for', async ({ page }) => {
    await page.goto('/settings/account');
    await expect(page).toHaveURL(/\/login\?redirect=/);

    await signIn(page, TEST_USER_USERNAME, TEST_PASSWORD);

    await expect(page).toHaveURL(/\/settings\/account/);
  });
});
