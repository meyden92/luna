import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Unauthorized landing', () => {
  test('regular user navigating /admin lands on /unauthorized with proper heading', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/admin');
    await expect(authenticatedPage).toHaveURL(/\/unauthorized/);
    await expect(authenticatedPage.getByRole('heading', { name: /^unauthorized$/i, level: 1 })).toBeVisible();
    await expect(authenticatedPage.getByText(/do not have permission/i)).toBeVisible();
  });
});
