import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Admin area', () => {
  test('admin user reaches /admin', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage).toHaveURL(/\/admin/);
    await expect(adminPage).not.toHaveURL(/\/unauthorized/);
    await expect(adminPage.getByRole('heading', { name: /admin panel/i })).toBeVisible();
  });

  test('regular user is redirected to /unauthorized', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin');
    await expect(authenticatedPage).toHaveURL(/\/unauthorized/);
  });
});
