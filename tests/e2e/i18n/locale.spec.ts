import { expect, test } from '@playwright/test';
import { setLocale } from '../fixtures/locale';

test.describe('i18n', () => {
  test('renders English hero badge by default', async ({ page, context }) => {
    await setLocale(context, 'en');
    await page.goto('/');
    await expect(page.getByText('Built with passion')).toBeVisible();
  });

  test('renders German hero badge when NEXT_LOCALE=de', async ({ page, context }) => {
    await setLocale(context, 'de');
    await page.goto('/');
    await expect(page.getByText('Mit Leidenschaft gebaut')).toBeVisible();
  });
});
