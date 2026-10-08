import { expect, test as setup } from '@playwright/test';
import { clientIpHeader, storageStatePath } from '../fixtures/users';
import { stackEnv } from '../stack-env';
import { signInThroughForm } from '../utils/sign-in';

setup.use({ extraHTTPHeaders: clientIpHeader() });

setup('admin signs in through the login form', async ({ page }) => {
  const { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } = stackEnv();

  const response = await signInThroughForm(page, E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD);

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
