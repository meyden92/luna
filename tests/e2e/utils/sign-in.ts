import { expect, type Page, type Response } from '@playwright/test';

/**
 * Fills and submits the `/login` form the page is already on, and returns the
 * successful sign-in response. Use it when the test cares where the form came
 * from (a `?redirect=` link); otherwise use `signInThroughForm`.
 */
export async function submitLoginForm(page: Page, username: string, password: string): Promise<Response> {
  // The button stays disabled until the form hydrates.
  const submit = page.getByRole('button', { name: /^login$/i });
  await expect(submit).toBeEnabled();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);

  const signIn = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/sign-in/username');
  await submit.click();
  const response = await signIn;
  expect(response.status()).toBe(200);
  return response;
}

/**
 * Signs in through the real `/login` form and waits for the dashboard. Returns
 * the sign-in response, so a caller can inspect the cookies it set.
 *
 * The page's context must send its own `cf-connecting-ip`: production allows
 * five sign-ins per 15 minutes per address.
 */
export async function signInThroughForm(page: Page, username: string, password: string): Promise<Response> {
  await page.goto('/login');
  const response = await submitLoginForm(page, username, password);
  await expect(page).toHaveURL(/\/dashboard/);
  return response;
}
