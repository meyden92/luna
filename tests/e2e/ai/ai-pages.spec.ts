import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Generate', () => {
  test('the four tabs live on one screen', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ai/generate');
    await expect(authenticatedPage).toHaveURL(/\/ai\/generate/);

    for (const label of ['Create', 'Edit an image', 'Templates', 'History']) {
      await expect(authenticatedPage.getByRole('tab', { name: label })).toBeVisible();
    }
  });

  test('Create asks for a prompt, not for pixel dimensions', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ai/generate');

    await expect(authenticatedPage.getByPlaceholder(/describe the image you want/i)).toBeVisible();
    // Shape replaced the width and height sliders; the jargon moved to the drawer.
    await expect(authenticatedPage.getByRole('group', { name: /shape/i })).toBeVisible();
    await expect(authenticatedPage.getByText(/inference steps/i)).toHaveCount(0);
  });

  test('a tab is reachable by URL, so it can be linked to', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ai/generate?tab=history');
    await expect(authenticatedPage.getByRole('tab', { name: 'History', selected: true })).toBeVisible();
  });
});
