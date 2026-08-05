import { expect, test } from '@playwright/test';

test.describe('Login flow', () => {
  test('login page exposes Discord sign-in', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /login with discord/i })).toBeVisible();
    await expect(page.getByText(/welcome back to/i)).toBeVisible();
  });

  test('unauthenticated dashboard access redirects to /login', async ({ page }) => {
    const response = await page.goto('/dashboard');
    expect(response?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
