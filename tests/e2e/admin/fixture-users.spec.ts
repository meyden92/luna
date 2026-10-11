import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { fixtureUsers } from '../fixtures/users';

test('the users list shows every fixture user the setup created', async ({ adminPage }, testInfo) => {
  await adminPage.goto('/admin/users');

  for (const user of fixtureUsers(testInfo.config.workers)) {
    await expect(adminPage.getByRole('link', { name: user.email })).toBeVisible();
  }
});
