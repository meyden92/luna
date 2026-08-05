import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Authenticated dashboard', () => {
  test('loads /dashboard without redirecting to /login', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard');
    await expect(authenticatedPage).toHaveURL(/\/dashboard/);
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('redirects authenticated users from / to /dashboard', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await expect(authenticatedPage).toHaveURL(/\/dashboard/);
  });
});
