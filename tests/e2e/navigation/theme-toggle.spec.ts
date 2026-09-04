import { expect, test } from '@playwright/test';

test.describe('Theme toggle', () => {
  test('toggling theme changes the root data-theme attribute', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');

    // The Appearance attribute is applied on the client, so before hydration the
    // button is inert and the attribute changes on its own. Re-reading it inside
    // the retry is what makes this assert the toggle rather than the hydration.
    await expect(async () => {
      const before = (await html.getAttribute('data-theme')) ?? '';
      await page.getByRole('button', { name: /toggle theme/i }).click();
      await expect(html).not.toHaveAttribute('data-theme', before, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  });
});
