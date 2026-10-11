import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';

// Appearance: the navigation's toggle. next-themes keeps the choice in the browser's local storage,
// so it survives a reload but not a new context (a fresh browser follows the operating system).
// updateUserTheme (the `theme` cookie) has no caller, and there is no "system" option to pick.

const colorScheme = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

test('the toggle switches between light and dark, and the choice survives a reload', async ({ workerPage }) => {
  await workerPage.emulateMedia({ colorScheme: 'light' });
  await workerPage.goto('/settings');
  const toDark = workerPage.getByRole('button', { name: 'Switch to dark appearance' });
  const toLight = workerPage.getByRole('button', { name: 'Switch to light appearance' });

  await expect(async () => {
    await toDark.click();
    await expect(toLight).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  expect(await colorScheme(workerPage)).toBe('dark');

  await workerPage.reload();
  await expect(toLight).toBeVisible();
  expect(await colorScheme(workerPage)).toBe('dark');

  await toLight.click();
  await expect(toDark).toBeVisible();
  expect(await colorScheme(workerPage)).toBe('light');

  await workerPage.reload();
  await expect(toDark).toBeVisible();
  expect(await colorScheme(workerPage)).toBe('light');
});

test('without a choice the page follows the operating system', async ({ workerPage }) => {
  await workerPage.emulateMedia({ colorScheme: 'dark' });
  await workerPage.goto('/settings');

  await expect(workerPage.getByRole('button', { name: 'Switch to light appearance' })).toBeVisible();
  expect(await colorScheme(workerPage)).toBe('dark');
});
