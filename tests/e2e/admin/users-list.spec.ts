import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { fixtureUser } from '../fixtures/users';

// The fixture users are only searched here, never changed.

test('search finds a user by email and by display name', async ({ adminPage }) => {
  const gallery = fixtureUser('gallery');
  const search = adminPage.getByPlaceholder('Search users');
  const submit = adminPage.getByRole('button', { name: 'Search' });
  // The search box remounts when the term changes, so each search starts on a fresh page.
  const searchFor = async (term: string) => {
    await adminPage.goto('/admin/users');
    await search.fill(term);
    await submit.click();
    await expect(adminPage).toHaveURL((url) => url.searchParams.get('search') === term);
  };

  await searchFor(gallery.email);
  await expect(adminPage.getByRole('link', { name: gallery.email })).toBeVisible();
  await expect(adminPage.getByText('Showing 1-1 of 1 users')).toBeVisible();

  await searchFor(gallery.name);
  await expect(adminPage.getByRole('link', { name: gallery.email })).toBeVisible();
  await expect(adminPage.getByText('Showing 1-1 of 1 users')).toBeVisible();

  await searchFor('nobody-has-this-name');
  await expect(adminPage.getByText('No users found.')).toBeVisible();
});

test('the quota user is listed with its allowance', async ({ adminPage }) => {
  const quota = fixtureUser('quota');
  await adminPage.goto('/admin/users');
  await adminPage.getByPlaceholder('Search users').fill(quota.email);
  await adminPage.getByRole('button', { name: 'Search' }).click();
  await expect(adminPage.getByRole('row', { name: new RegExp(quota.email) })).toContainText('/ 4.00 MB');
});
