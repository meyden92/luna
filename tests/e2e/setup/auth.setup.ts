import { expect, test as setup } from '@playwright/test';
import { clientIpHeader, storageStatePath } from '../fixtures/users';
import { stackEnv } from '../stack-env';

setup.use({ extraHTTPHeaders: clientIpHeader() });

setup('admin signs in through the login form', async ({ page }) => {
  const { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } = stackEnv();

  await page.goto('/login');
  // The button stays disabled until the form hydrates.
  const submit = page.getByRole('button', { name: /^login$/i });
  await expect(submit).toBeEnabled();
  await page.getByLabel('Username').fill(E2E_ADMIN_USERNAME);
  await page.getByLabel('Password').fill(E2E_ADMIN_PASSWORD);

  const signIn = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/sign-in/username');
  await submit.click();
  const response = await signIn;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard/);

  // Whatever cookies the real sign-in set (their names, `__Secure-` prefix
  // included, are Better-Auth's business) must have been accepted.
  const setNames = (await response.headersArray())
    .filter(({ name }) => name.toLowerCase() === 'set-cookie')
    .map(({ value }) => value.slice(0, value.indexOf('=')));
  expect(setNames.length).toBeGreaterThan(0);
  const stored = (await page.context().cookies()).map((cookie) => cookie.name);
  expect(stored).toEqual(expect.arrayContaining(setNames));

  await page.context().storageState({ path: storageStatePath('admin') });
});
