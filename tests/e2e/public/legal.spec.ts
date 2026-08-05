import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Legal pages', () => {
  test('privacy page renders policy heading (public)', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: /privacy policy/i, level: 1 })).toBeVisible();
  });

  test('terms page renders ToS heading (auth-gated by middleware)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/tos');
    await expect(authenticatedPage.getByRole('heading', { name: /terms of service/i, level: 1 })).toBeVisible();
  });
});
