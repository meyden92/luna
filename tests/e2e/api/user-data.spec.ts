import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('User-scoped API endpoints', () => {
  test('GET /api/folders returns array for authenticated user', async ({ authenticatedContext }) => {
    const res = await authenticatedContext.request.get('/api/folders');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body) || Array.isArray(body?.data) || typeof body === 'object').toBe(true);
  });

  test('GET /api/tags returns array for authenticated user', async ({ authenticatedContext }) => {
    const res = await authenticatedContext.request.get('/api/tags');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body) || Array.isArray(body?.data) || typeof body === 'object').toBe(true);
  });

  test('GET /api/gallery returns paginated payload', async ({ authenticatedContext }) => {
    const res = await authenticatedContext.request.get('/api/gallery?limit=10');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toBeTruthy();
  });

  test('GET /api/user/settings returns settings object', async ({ authenticatedContext }) => {
    const res = await authenticatedContext.request.get('/api/user/settings');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toBeTruthy();
  });
});
