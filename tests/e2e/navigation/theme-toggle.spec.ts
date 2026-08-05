import { expect, test } from '@playwright/test';

test.describe('Theme toggle', () => {
  test('toggling theme changes <html> class', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const before = (await html.getAttribute('class')) ?? '';

    await page.getByRole('button', { name: /toggle theme/i }).click();
    await expect(async () => {
      const after = (await html.getAttribute('class')) ?? '';
      expect(after).not.toBe(before);
    }).toPass({ timeout: 5_000 });
  });
});
