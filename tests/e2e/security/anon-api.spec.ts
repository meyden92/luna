import { expect, test } from '@playwright/test';

test.describe('Anonymous access is rejected on protected APIs', () => {
  const protectedEndpoints = ['/api/folders', '/api/tags', '/api/gallery', '/api/user/settings', '/api/ai/templates'] as const;

  for (const path of protectedEndpoints) {
    test(`GET ${path} returns 401/403 for anon`, async ({ request }) => {
      const res = await request.get(path);
      expect([401, 403]).toContain(res.status());
    });
  }

  test('GET /api/ai/models is public', async ({ request }) => {
    const res = await request.get('/api/ai/models');
    expect(res.ok()).toBe(true);
  });
});
