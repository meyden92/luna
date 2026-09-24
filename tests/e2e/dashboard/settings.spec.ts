import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

test.describe('Settings', () => {
  test('opens on Uploads & ShareX', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings');
    await expect(authenticatedPage).toHaveURL(/\/settings/);
    await expect(authenticatedPage.getByRole('heading', { name: /uploads & sharex/i })).toBeVisible();
  });

  test('the sub-nav reaches all three sections', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings');

    await authenticatedPage.getByRole('link', { name: /^profile$/i }).click();
    await expect(authenticatedPage).toHaveURL(/\/settings\/profile/);
    await expect(authenticatedPage.getByRole('heading', { name: /^profile$/i })).toBeVisible();

    await authenticatedPage.getByRole('link', { name: /^storage$/i }).click();
    await expect(authenticatedPage).toHaveURL(/\/settings\/storage/);
    await expect(authenticatedPage.getByRole('heading', { name: /^storage$/i })).toBeVisible();
  });

  test('Profile holds back a save until something changes', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/profile');

    const saveBar = authenticatedPage.getByText(/you have unsaved changes/i);
    await expect(saveBar).toHaveCount(0);

    await authenticatedPage.getByLabel(/display name/i).fill('Renamed in a test');
    await expect(saveBar).toBeVisible();

    await authenticatedPage.getByRole('button', { name: /discard/i }).click();
    await expect(saveBar).toHaveCount(0);
  });

  test('Profile has controls for bio, description and marketing emails', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/settings/profile');

    const saveBar = authenticatedPage.getByText(/you have unsaved changes/i);
    await expect(saveBar).toHaveCount(0);

    await authenticatedPage.getByLabel(/^bio$/i).fill('Bio set in a test');
    await expect(saveBar).toBeVisible();
    await authenticatedPage.getByRole('button', { name: /discard/i }).click();
    await expect(saveBar).toHaveCount(0);

    await authenticatedPage.getByLabel(/^description$/i).fill('Description set in a test');
    await expect(saveBar).toBeVisible();
    await authenticatedPage.getByRole('button', { name: /discard/i }).click();
    await expect(saveBar).toHaveCount(0);

    await authenticatedPage.getByLabel(/marketing emails/i).click();
    await expect(saveBar).toBeVisible();
    await authenticatedPage.getByRole('button', { name: /discard/i }).click();
    await expect(saveBar).toHaveCount(0);
  });
});
