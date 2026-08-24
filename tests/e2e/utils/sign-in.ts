import { expect, type Page } from '@playwright/test';

/**
 * Signs in through the real form (issue #54).
 *
 * The login page is server-rendered, and its submit button stays disabled until
 * the client has hydrated — otherwise a submit is handled by the browser as a
 * native GET and throws away what was typed. Waiting for the button to become
 * enabled is therefore also how this waits for React to own the form.
 */
export async function signIn(page: Page, username: string, password: string): Promise<void> {
  await expect(page.getByRole('button', { name: /^login$/i })).toBeEnabled();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^login$/i }).click();
}
