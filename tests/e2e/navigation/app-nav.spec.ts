import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('App navigation (signed in)', () => {
  test('Upload is reachable from every page, not just Files', async ({ authenticatedPage }) => {
    for (const path of ['/dashboard', '/ai/generate', '/bin', '/settings']) {
      await authenticatedPage.goto(path);
      await expect(authenticatedPage.getByRole('button', { name: /^upload$/i })).toBeVisible();
    }
  });

  test('"Dashboard" is called Files and "Tools (Beta)" is called Tools', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard');

    await expect(authenticatedPage.getByRole('link', { name: /^files$/i })).toBeVisible();
    await expect(authenticatedPage.getByRole('link', { name: /^dashboard$/i })).toHaveCount(0);
    await expect(authenticatedPage.getByText(/tools \(beta\)/i)).toHaveCount(0);
  });
});
