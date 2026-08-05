import { expect, test } from '@playwright/test';
import { setLocale } from '../fixtures/locale';

test.describe('Locale cookie persists across navigation', () => {
  test('German hero stays German after navigating to /privacy and back', async ({ page, context }) => {
    await setLocale(context, 'de');
    await page.goto('/');
    await expect(page.getByText('Mit Leidenschaft gebaut')).toBeVisible();

    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy/);

    await page.goto('/');
    await expect(page.getByText('Mit Leidenschaft gebaut')).toBeVisible();
  });
});
