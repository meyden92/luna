import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Admin-only API gating', () => {
  const adminGetEndpoints = [
    '/api/admin/users',
    '/api/admin/tasks',
    '/api/admin/tasks/functions',
    '/api/admin/tasks/stats',
    '/api/admin/tasks/executions',
    '/api/admin/tasks/logs',
    '/api/admin/deleted-files',
  ] as const;

  test.describe('regular user is denied', () => {
    for (const path of adminGetEndpoints) {
      test(`GET ${path} blocks regular user`, async ({ authenticatedContext }) => {
        const res = await authenticatedContext.request.get(path);
        expect([401, 403]).toContain(res.status());
      });
    }
  });

  test.describe('admin user is allowed', () => {
    for (const path of adminGetEndpoints) {
      test(`GET ${path} allows admin`, async ({ adminContext }) => {
        const res = await adminContext.request.get(path);
        expect([200, 204]).toContain(res.status());
      });
    }
  });
});
