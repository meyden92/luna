import { expect, type Page } from '@playwright/test';

/**
 * Signs in through the real form. The submit button stays disabled until the
 * page hydrates, so waiting for it is also how this waits for React to own the
 * form.
 */
export async function signIn(page: Page, username: string, password: string): Promise<void> {
  await expect(page.getByRole('button', { name: /^login$/i })).toBeEnabled();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^login$/i }).click();
}
