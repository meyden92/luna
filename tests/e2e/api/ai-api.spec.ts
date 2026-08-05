import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('AI API endpoints', () => {
  test('GET /api/ai/models returns list', async ({ authenticatedContext }) => {
    const res = await authenticatedContext.request.get('/api/ai/models');
    expect(res.ok()).toBe(true);
  });

  test('GET /api/ai/templates returns list', async ({ authenticatedContext }) => {
    const res = await authenticatedContext.request.get('/api/ai/templates');
    expect(res.ok()).toBe(true);
  });
});
