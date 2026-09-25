import { expect, test } from '@playwright/test';
import { setLocale } from '../fixtures/locale';

test.describe('i18n', () => {
  test('renders English hero badge by default', async ({ page, context }) => {
    await setLocale(context, 'en');
    await page.goto('/');
    await expect(page.getByText('Built with passion')).toBeVisible();
  });

  // The landing page is English-only; a German locale cookie must not break it.
  test('renders English hero badge when NEXT_LOCALE=de', async ({ page, context }) => {
    await setLocale(context, 'de');
    await page.goto('/');
    await expect(page.getByText('Built with passion')).toBeVisible();
  });
});
