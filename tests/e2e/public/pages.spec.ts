import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

test('the landing page renders its hero', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: /Share\s*Simply\s*Better/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start Creating Now' }).first()).toBeVisible();
});

test('/privacy renders the privacy policy', async ({ page }) => {
  const response = await page.goto('/privacy');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Privacy Policy | LunaShare');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '1. Introduction' })).toBeVisible();
});

test('/tos renders the terms of service', async ({ page }) => {
  const response = await page.goto('/tos');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Terms of Service | LunaShare');
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '1. Agreement to Terms' })).toBeVisible();
});

test('an unknown route shows the not-found page with status 404', async ({ page }) => {
  const response = await page.goto('/this/page/does-not-exist');

  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle('404 - Page Not Found | LunaShare');
  await expect(page.getByRole('heading', { level: 1, name: '404 - Page Not Found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('/api/health reports ok with a build and a timestamp', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ status: 'ok' });
  expect(body.build).toEqual(expect.objectContaining({ commit: expect.any(String), time: expect.any(String) }));
  expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
});
