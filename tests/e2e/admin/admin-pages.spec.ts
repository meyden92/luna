import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Admin sub-pages', () => {
  test('admin index renders Admin heading', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('heading', { name: /^admin$/i, level: 1 })).toBeVisible();
  });

  test('admin users page renders user table card', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    await expect(adminPage).toHaveURL(/\/admin\/users/);
    await expect(adminPage.getByText(/all registered users/i)).toBeVisible();
  });

  test('admin audit page renders Audit Logs heading', async ({ adminPage }) => {
    await adminPage.goto('/admin/audit');
    await expect(adminPage.getByRole('heading', { name: /audit logs/i })).toBeVisible();
  });

  test('admin templates page renders Template Management heading', async ({ adminPage }) => {
    await adminPage.goto('/admin/templates');
    await expect(adminPage.getByRole('heading', { name: /template management/i })).toBeVisible();
  });

  test('admin global-variables page renders heading', async ({ adminPage }) => {
    await adminPage.goto('/admin/global-variables');
    await expect(adminPage.getByRole('heading', { name: /global variables/i })).toBeVisible();
  });

  test('admin tasks page renders Admin Tasks heading', async ({ adminPage }) => {
    await adminPage.goto('/admin/tasks');
    await expect(adminPage.getByRole('heading', { name: /admin tasks/i })).toBeVisible();
  });

  test('admin models page renders Generation Models heading', async ({ adminPage }) => {
    await adminPage.goto('/admin/models');
    await expect(adminPage.getByRole('heading', { name: /generation models/i })).toBeVisible();
  });

  test('regular user is blocked from each admin sub-page', async ({ authenticatedPage }) => {
    for (const path of ['/admin/users', '/admin/audit', '/admin/templates']) {
      await authenticatedPage.goto(path);
      await expect(authenticatedPage).toHaveURL(/\/unauthorized/);
    }
  });
});
