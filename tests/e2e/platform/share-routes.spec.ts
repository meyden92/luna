import { expect, test } from '@playwright/test';

test.describe('Public share routes for unknown IDs render 404 content', () => {
  test('GET /view/<unknown> renders not-found page', async ({ page }) => {
    await page.goto('/view/this-is-not-a-real-file-id', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /404/i, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
  });

  test('GET /form/<unknown> renders not-found page', async ({ page }) => {
    await page.goto('/form/this-is-not-a-real-form-id', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /404/i, level: 1 })).toBeVisible();
  });
});
