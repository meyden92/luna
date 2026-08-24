import { expect, test } from '@playwright/test';

test.describe('Theme toggle', () => {
  test('toggling theme changes <html> class', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');

    // The theme class is applied on the client, so before hydration the button
    // is inert and the class changes on its own. Re-reading it inside the retry
    // is what makes this assert the toggle rather than the hydration.
    await expect(async () => {
      const before = (await html.getAttribute('class')) ?? '';
      await page.getByRole('button', { name: /toggle theme/i }).click();
      await expect(html).not.toHaveClass(before, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  });
});
