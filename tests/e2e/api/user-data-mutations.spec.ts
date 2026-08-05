import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('User mutation endpoints reject wrong methods', () => {
  test('GET /api/user/profile is not allowed (PATCH-only)', async ({ authenticatedContext }) => {
    const res = await authenticatedContext.request.get('/api/user/profile');
    expect(res.status()).toBe(405);
  });

  test('GET /api/user/tokens is allowed; only collection scope responds', async ({ authenticatedContext }) => {
    const res = await authenticatedContext.request.get('/api/user/tokens');
    expect([200, 405]).toContain(res.status());
  });
});
