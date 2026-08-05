import { expect, test } from '@playwright/test';

test.describe('Top navigation (anonymous)', () => {
  test('Login link goes to /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /^login$/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('Open app link goes to /dashboard (which redirects to /login when anon)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /open app/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('LunaShare brand link returns to /', async ({ page }) => {
    await page.goto('/login');
    await page
      .getByRole('link', { name: /luna ?share/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/$/);
  });
});
