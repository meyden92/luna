import { expect, test } from '@playwright/test';
import { setLocale } from '../fixtures/locale';

test.describe('Locale cookie persists across navigation', () => {
  test('Hero still renders after navigating to /privacy and back with a German locale cookie', async ({ page, context }) => {
    await setLocale(context, 'de');
    await page.goto('/');
    await expect(page.getByText('Built with passion')).toBeVisible();

    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy/);

    await page.goto('/');
    await expect(page.getByText('Built with passion')).toBeVisible();
  });
});
