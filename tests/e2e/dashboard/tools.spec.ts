import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Tool pages', () => {
  test('image-grid page renders generator heading', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/image-grid');
    await expect(authenticatedPage).toHaveURL(/\/image-grid/);
    await expect(authenticatedPage.getByRole('heading', { name: /image grid generator/i })).toBeVisible();
  });

  test('audio editor page loads without redirect', async ({ authenticatedPage }) => {
    const res = await authenticatedPage.goto('/tools/audio');
    expect(res?.status()).toBeLessThan(400);
    await expect(authenticatedPage).toHaveURL(/\/tools\/audio/);
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('video editor page loads', async ({ authenticatedPage }) => {
    const res = await authenticatedPage.goto('/tools/video');
    expect(res?.status()).toBeLessThan(400);
    await expect(authenticatedPage).toHaveURL(/\/tools\/video/);
  });

  test('converter page loads', async ({ authenticatedPage }) => {
    const res = await authenticatedPage.goto('/tools/converter');
    expect(res?.status()).toBeLessThan(400);
    await expect(authenticatedPage).toHaveURL(/\/tools\/converter/);
  });

  test('player page loads', async ({ authenticatedPage }) => {
    const res = await authenticatedPage.goto('/player');
    expect(res?.status()).toBeLessThan(400);
    await expect(authenticatedPage).toHaveURL(/\/player/);
  });
});
