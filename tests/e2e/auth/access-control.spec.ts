import { type APIResponse, expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { fixtureUser, workerRole } from '../fixtures/users';

/**
 * Headers the app's own client sends with a server-function call. Without a
 * same-origin `Origin` the CSRF check answers 403 before authentication runs.
 */
const serverFnHeaders = (origin: string) => ({ 'x-tsr-serverFn': 'true', Origin: origin });

/**
 * The error message a server-function response carries, or null when it carries
 * a result. A refused call is still an HTTP 200: TanStack serializes the thrown
 * error into the body instead of using the status line.
 */
async function refusalOf(response: APIResponse): Promise<string | null> {
  expect(response.status()).toBe(200);
  const body = await response.text();
  if (!body.includes('$TSR/Error')) return null;
  return /"message":\{"t":1,"s":"([^"]*)"\}/.exec(body)?.[1] ?? null;
}

/** URLs of the server-function GET requests `action` makes in the page. */
async function serverFnRequests(page: Page, action: () => Promise<void>): Promise<string[]> {
  const urls = new Set<string>();
  const onRequest = (request: { method(): string; url(): string }) => {
    if (request.method() === 'GET' && request.url().includes('/_serverFn/')) urls.add(request.url());
  };
  page.on('request', onRequest);
  await action();
  await page.waitForLoadState('networkidle');
  page.off('request', onRequest);
  return [...urls];
}

for (const path of ['/admin', '/admin/users', '/admin/tasks']) {
  test(`a worker user opening ${path} lands on /unauthorized`, async ({ workerPage }) => {
    await workerPage.goto(path);

    await expect(workerPage).toHaveURL(/\/unauthorized$/);
    await expect(workerPage.getByRole('heading', { level: 1, name: 'Unauthorized' })).toBeVisible();
    await expect(workerPage.getByRole('link', { name: 'Go to Login' })).toBeVisible();
  });
}

test('a signed-out visitor opening /admin is sent to the login page', async ({ page }) => {
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/login$/);
});

test('the account menu offers no Admin link to a worker user', async ({ workerPage }) => {
  await workerPage.goto('/dashboard');
  await workerPage.getByRole('button', { name: 'Account' }).click();

  await expect(workerPage.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
  await expect(workerPage.getByRole('menuitem', { name: 'Admin' })).toHaveCount(0);
});

test('registration is closed: sign-up is refused over the API and the UI offers none', async ({ page, request }) => {
  const email = 'intruder@lunashare.test';
  const response = await request.post('/api/auth/sign-up/email', { data: { name: 'Intruder', email, password: 'intruder-password-1' } });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' });

  // And no account exists, so the sign-in that would follow fails too.
  const signIn = await request.post('/api/auth/sign-in/email', { data: { email, password: 'intruder-password-1' } });
  expect(signIn.status()).toBe(401);

  for (const path of ['/login', '/']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: /sign ?up|register|create (an )?account/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /sign ?up|register|create (an )?account/i })).toHaveCount(0);
  }
  const signUpPage = await page.goto('/signup');
  expect(signUpPage?.status()).toBe(404);
});

test.describe('anonymous API clients', () => {
  test('upload endpoints answer 401 without a session or Token', async ({ request }) => {
    const form = { multipart: { file: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') } } };

    const web = await request.post('/api/upload/web', form);
    expect(web.status()).toBe(401);
    expect(await web.json()).toMatchObject({ code: 'UNAUTHORIZED' });

    const sharex = await request.post('/api/upload/sharex', form);
    expect(sharex.status()).toBe(401);
    expect(await sharex.json()).toMatchObject({ code: 'UNAUTHORIZED' });

    const wrongToken = await request.post('/api/upload/sharex', { ...form, headers: { Authorization: 'Bearer not-a-real-token' } });
    expect(wrongToken.status()).toBe(401);
  });

  test('/api/download-zip answers 401 without a session', async ({ request }) => {
    const response = await request.post('/api/download-zip', { data: { ids: ['x'] } });

    expect(response.status()).toBe(401);
  });

  test('the gallery server function refuses an anonymous caller', async ({ galleryPage, request, stack }) => {
    // Server function ids are hashed in the production build, so take the real
    // request the Files screen makes and replay it without the session.
    const urls = await serverFnRequests(galleryPage, () => galleryPage.goto('/dashboard').then(() => undefined));
    const gallery = urls.filter((url) => decodeURIComponent(url).includes('excludeFoldered'));
    expect(gallery.length).toBeGreaterThan(0);

    for (const url of gallery) {
      const response = await request.get(url, { headers: serverFnHeaders(stack.E2E_BASE_URL) });
      expect(await refusalOf(response)).toBe('Unauthorized');
    }
  });

  test('the Settings loaders refuse an anonymous caller and leak nothing', async ({ workerPage, request, stack }, testInfo) => {
    const { username, email } = fixtureUser(workerRole(testInfo.parallelIndex));
    await workerPage.goto('/dashboard');
    const urls = await serverFnRequests(workerPage, async () => {
      await workerPage.getByRole('button', { name: 'Account' }).click();
      await workerPage.getByRole('menuitem', { name: 'Settings' }).click();
      await expect(workerPage).toHaveURL(/\/settings/);
    });

    let refused = 0;
    for (const url of urls) {
      const response = await request.get(url, { headers: serverFnHeaders(stack.E2E_BASE_URL) });
      if ((await refusalOf(response)) === 'Unauthorized') refused += 1;
      const body = await response.text();
      expect(body).not.toContain(username);
      expect(body).not.toContain(email);
    }
    expect(refused).toBeGreaterThan(0);
  });

  test('an admin server function refuses anonymous callers and non-admin users', async ({ adminPage, workerRequest, request, stack }) => {
    await adminPage.goto('/admin');
    const urls = await serverFnRequests(adminPage, async () => {
      await adminPage.getByRole('complementary').getByRole('navigation').getByRole('link', { name: 'Users' }).click();
      await expect(adminPage).toHaveURL(/\/admin\/users/);
    });
    const listUsers = urls.filter((url) => decodeURIComponent(url).includes('pageSize'));
    expect(listUsers.length).toBeGreaterThan(0);

    for (const url of listUsers) {
      const anonymous = await request.get(url, { headers: serverFnHeaders(stack.E2E_BASE_URL) });
      expect(await refusalOf(anonymous)).toBe('Unauthorized');
      const worker = await workerRequest.get(url, { headers: serverFnHeaders(stack.E2E_BASE_URL) });
      expect(await refusalOf(worker)).toBe('Admin access required');
    }
  });
});
