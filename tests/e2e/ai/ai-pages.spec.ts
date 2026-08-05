import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('AI feature pages', () => {
  test('AI generate page renders Prompt Generation heading', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ai/generate');
    await expect(authenticatedPage).toHaveURL(/\/ai\/generate/);
    await expect(authenticatedPage.getByRole('heading', { name: /prompt generation/i, level: 1 })).toBeVisible();
  });

  test('AI edit page renders Image Generation heading', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ai/edit');
    await expect(authenticatedPage).toHaveURL(/\/ai\/edit/);
    await expect(authenticatedPage.getByRole('heading', { name: /image generation/i, level: 1 })).toBeVisible();
  });

  test('AI templates page renders Template Generation heading', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/ai/templates');
    await expect(authenticatedPage).toHaveURL(/\/ai\/templates/);
    await expect(authenticatedPage.getByRole('heading', { name: /template generation/i, level: 1 })).toBeVisible();
  });
});
