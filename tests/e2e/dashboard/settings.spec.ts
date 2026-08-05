import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Settings', () => {
  test('settings index renders profile section', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings');
    await expect(authenticatedPage).toHaveURL(/\/settings/);
    await expect(authenticatedPage.getByRole('heading', { name: /^profile$/i, level: 3 })).toBeVisible();
    await expect(authenticatedPage.getByRole('heading', { name: /appearance & language/i })).toBeVisible();
  });

  test('settings/account renders', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/account');
    await expect(authenticatedPage).toHaveURL(/\/settings\/account/);
  });

  test('settings/api renders tokens area', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/api');
    await expect(authenticatedPage).toHaveURL(/\/settings\/api/);
  });

  test('settings/usage shows storage stats', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/usage');
    await expect(authenticatedPage).toHaveURL(/\/settings\/usage/);
    await expect(authenticatedPage.getByText(/total files/i).first()).toBeVisible();
    await expect(authenticatedPage.getByText(/total storage used/i).first()).toBeVisible();
  });
});
