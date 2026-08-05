import { expect, test } from '@playwright/test';

test.describe('Landing page', () => {
  test('renders hero copy for unauthenticated visitors', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Built with passion')).toBeVisible();
  });
});
