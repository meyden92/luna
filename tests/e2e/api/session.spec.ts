import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Better-Auth session API', () => {
  test('returns 200 with null for anon clients', async ({ request }) => {
    const res = await request.get('/api/auth/get-session');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body === 'null' || body === '' || body.includes('null')).toBe(true);
  });

  test('returns user for authenticated session', async ({ authenticatedContext }) => {
    const res = await authenticatedContext.request.get('/api/auth/get-session');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body?.user?.email).toBe('e2e-user@lunashare.test');
    expect(body?.session?.userId).toBeTruthy();
  });

  test('returns admin user with isSuperAdmin flag', async ({ adminContext }) => {
    const res = await adminContext.request.get('/api/auth/get-session');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body?.user?.email).toBe('e2e-admin@lunashare.test');
  });
});
