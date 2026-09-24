import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Snippets', () => {
  test('renders the list beside the editor', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/bin');
    await expect(authenticatedPage).toHaveURL(/\/bin/);

    await expect(authenticatedPage.getByRole('heading', { name: /^snippets$/i, level: 1 })).toBeVisible();
    await expect(authenticatedPage.getByPlaceholder(/search snippets/i)).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: /new/i })).toBeVisible();
  });

  test('the two stacked cards are gone', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/bin');
    await expect(authenticatedPage.getByText(/create new snippet/i)).toHaveCount(0);
  });
});
