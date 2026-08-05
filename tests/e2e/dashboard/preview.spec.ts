import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Preview area (component playground)', () => {
  const previewRoutes = ['/preview', '/preview/calendar', '/preview/charting', '/preview/selection', '/preview/squi'] as const;

  for (const path of previewRoutes) {
    test(`${path} loads without redirect`, async ({ authenticatedPage }) => {
      const res = await authenticatedPage.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(authenticatedPage).not.toHaveURL(/\/login/);
    });
  }
});
