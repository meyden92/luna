import { expect, type Page, type Response } from '@playwright/test';

/**
 * Signs in through the real `/login` form and waits for the dashboard. Returns
 * the sign-in response, so a caller can inspect the cookies it set.
 *
 * The page's context must send its own `cf-connecting-ip`: production allows
 * five sign-ins per 15 minutes per address.
 */
export async function signInThroughForm(page: Page, username: string, password: string): Promise<Response> {
  await page.goto('/login');
  // The button stays disabled until the form hydrates.
  const submit = page.getByRole('button', { name: /^login$/i });
  await expect(submit).toBeEnabled();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);

  const signIn = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/sign-in/username');
  await submit.click();
  const response = await signIn;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard/);
  return response;
}
