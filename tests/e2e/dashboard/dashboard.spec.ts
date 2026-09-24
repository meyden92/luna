import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Files', () => {
  test('loads /dashboard without redirecting to /login', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard');
    await expect(authenticatedPage).toHaveURL(/\/dashboard/);
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('redirects authenticated users from / to /dashboard', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/');
    await expect(authenticatedPage).toHaveURL(/\/dashboard/);
  });

  test('the title is the scope, and the toolbar holds four controls', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard');

    await expect(authenticatedPage.getByRole('heading', { name: /^all files$/i, level: 1 })).toBeVisible();
    await expect(authenticatedPage.getByPlaceholder(/search by name/i)).toBeVisible();
    await expect(authenticatedPage.getByRole('group', { name: /file type/i })).toBeVisible();
    await expect(authenticatedPage.getByRole('combobox', { name: /sort files/i })).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: /view options/i })).toBeVisible();
  });

  test('"/" focuses the search field from anywhere on the page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard');

    await authenticatedPage.locator('body').press('/');
    await expect(authenticatedPage.getByPlaceholder(/search by name/i)).toBeFocused();
  });

  test('the sidebar offers "Not in a folder" as its own scope', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard');

    await authenticatedPage.getByRole('button', { name: /not in a folder/i }).click();
    await expect(authenticatedPage.getByRole('heading', { name: /^not in a folder$/i, level: 1 })).toBeVisible();
  });

  test('the folder sidebar appears on Files only', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard');
    await expect(authenticatedPage.getByRole('complementary', { name: /folders/i })).toBeVisible();

    // What #57 reported: it used to render on every page in the signed-in area.
    for (const path of ['/ai/generate', '/bin', '/automations', '/settings']) {
      await authenticatedPage.goto(path);
      await expect(authenticatedPage.getByRole('complementary', { name: /folders/i })).toHaveCount(0);
    }
  });
});
