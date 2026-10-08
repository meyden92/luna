import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { fixtureUser } from '../fixtures/users';
import { signInThroughForm } from '../utils/sign-in';

// Production allows 5 sign-ins per 15 minutes per address. Only the address is
// throttled, never the account, so the empty user (whose data nobody changes)
// can be the target while every other spec signs in from its own address.

test('the sixth failed sign-in from one address is rate limited, another address can still sign in', async ({
  browser,
  playwright,
  stack,
}) => {
  const { username, password } = fixtureUser('empty');
  const throttledIp = { 'cf-connecting-ip': '203.0.113.77' };

  const attacker = await playwright.request.newContext({ baseURL: stack.E2E_BASE_URL, extraHTTPHeaders: throttledIp });
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await attacker.post('/api/auth/sign-in/username', { data: { username, password: `wrong-password-${attempt}` } });
    expect(response.status(), `attempt ${attempt}`).toBe(401);
  }
  const sixth = await attacker.post('/api/auth/sign-in/username', { data: { username, password: 'wrong-password-6' } });
  expect(sixth.status()).toBe(429);
  // The limit is on the address: even the right password is refused from it.
  const correct = await attacker.post('/api/auth/sign-in/username', { data: { username, password } });
  expect(correct.status()).toBe(429);
  await attacker.dispose();

  // The login form tells the same visitor why.
  const throttled = await browser.newContext({ extraHTTPHeaders: throttledIp });
  const throttledPage = await throttled.newPage();
  await throttledPage.goto('/login');
  const submit = throttledPage.getByRole('button', { name: /^login$/i });
  await expect(submit).toBeEnabled();
  await throttledPage.getByLabel('Username').fill(username);
  await throttledPage.getByLabel('Password').fill(password);
  await submit.click();
  await expect(throttledPage.getByText('Too many attempts. Try again in a few minutes.')).toBeVisible();
  expect(await throttled.cookies()).toEqual([]);
  await throttled.close();

  // Somebody else on another address is unaffected.
  const other = await browser.newContext({ extraHTTPHeaders: { 'cf-connecting-ip': '203.0.113.78' } });
  await signInThroughForm(await other.newPage(), username, password);
  await other.close();
});
