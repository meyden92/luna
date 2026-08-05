import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Bin (snippets)', () => {
  test('renders snippets page heading', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/bin');
    await expect(authenticatedPage).toHaveURL(/\/bin/);
    await expect(authenticatedPage.getByRole('heading', { name: /your snippets/i, level: 1 })).toBeVisible();
  });

  test('shows create new snippet card', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/bin');
    await expect(authenticatedPage.getByText(/create new snippet/i).first()).toBeVisible();
  });
});
