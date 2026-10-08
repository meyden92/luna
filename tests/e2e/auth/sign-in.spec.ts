import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { fixtureUser, workerRole } from '../fixtures/users';
import { signInThroughForm, submitLoginForm } from '../utils/sign-in';

// Each test gets a fresh, signed-out context with its own `cf-connecting-ip`, so
// none of them can trip the production sign-in rate limiter (5 per 15 minutes).

const WRONG_PASSWORD = 'definitely-not-the-password';

test('a user signs in through the form and lands on Files', async ({ page }, testInfo) => {
  const { username, password } = fixtureUser(workerRole(testInfo.parallelIndex));

  await signInThroughForm(page, username, password);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'All files' })).toBeVisible();
});

test('the login page asks for a Username and password and checks them before submitting', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle('Login | LunaShare');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back to LunaShare' })).toBeVisible();

  const submit = page.getByRole('button', { name: /^login$/i });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText('Username is required')).toBeVisible();
  await expect(page.getByText('Password is required')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong password shows the error and sets no session', async ({ page, context }, testInfo) => {
  const { username } = fixtureUser(workerRole(testInfo.parallelIndex));
  await page.goto('/login');
  const submit = page.getByRole('button', { name: /^login$/i });
  await expect(submit).toBeEnabled();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(WRONG_PASSWORD);

  const signIn = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/sign-in/username');
  await submit.click();

  expect((await signIn).status()).toBe(401);
  await expect(page.getByText('Invalid username or password')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(await context.cookies()).toEqual([]);

  // Still signed out: a protected page sends the visitor back to the login form.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?redirect=/);
});

test('an unknown Username gets the same error as a wrong password', async ({ page, request }, testInfo) => {
  const { username } = fixtureUser(workerRole(testInfo.parallelIndex));

  // What the API says to a client that guesses.
  const wrongPassword = await request.post('/api/auth/sign-in/username', { data: { username, password: WRONG_PASSWORD } });
  const unknownUser = await request.post('/api/auth/sign-in/username', {
    data: { username: 'nobody-by-this-name', password: WRONG_PASSWORD },
  });
  expect(unknownUser.status()).toBe(wrongPassword.status());
  expect(await unknownUser.json()).toEqual(await wrongPassword.json());

  // What the visitor sees in the form.
  await page.goto('/login');
  const submit = page.getByRole('button', { name: /^login$/i });
  await expect(submit).toBeEnabled();
  await page.getByLabel('Username').fill('nobody-by-this-name');
  await page.getByLabel('Password').fill(WRONG_PASSWORD);
  await submit.click();

  await expect(page.getByText('Invalid username or password')).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);
});

test('signed out, protected pages send you to /login?redirect= and signing in brings you back', async ({ page }, testInfo) => {
  const { username, password } = fixtureUser(workerRole(testInfo.parallelIndex));

  await page.goto('/dashboard?file=x');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard%3Ffile%3Dx$/);
  await submitLoginForm(page, username, password);
  await expect(page).toHaveURL(/\/dashboard\?file=x$/);

  await page.context().clearCookies();
  await page.goto('/settings/storage');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings%2Fstorage$/);
  await submitLoginForm(page, username, password);
  await expect(page).toHaveURL(/\/settings\/storage$/);
});

test('signing out from the navigation ends the session', async ({ page, context, playwright, stack }, testInfo) => {
  const { username, password } = fixtureUser(workerRole(testInfo.parallelIndex));
  await signInThroughForm(page, username, password);
  const sessionCookies = await context.cookies();
  expect(sessionCookies.length).toBeGreaterThan(0);

  // The browser's cookie, replayed by an API client. A zip request for an id that
  // doesn't exist is answered 404 while the session is good, and 401 once it is not.
  const replay = await playwright.request.newContext({
    baseURL: stack.E2E_BASE_URL,
    storageState: { cookies: sessionCookies, origins: [] },
  });
  expect((await replay.post('/api/download-zip', { data: { ids: ['x'] } })).status()).toBe(404);

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Logged out')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard$/);

  expect((await replay.post('/api/download-zip', { data: { ids: ['x'] } })).status()).toBe(401);
  await replay.dispose();
});
