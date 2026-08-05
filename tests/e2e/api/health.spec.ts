import { expect, test } from '@playwright/test';

test.describe('Health endpoint', () => {
  test('GET /api/health returns ok status', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('build');
  });
});
