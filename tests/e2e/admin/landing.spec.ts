import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

test('the admin lands on /admin and sees the admin navigation', async ({ adminPage }) => {
  await adminPage.goto('/admin');

  await expect(adminPage).toHaveURL(/\/admin$/);
  await expect(adminPage.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
  const nav = adminPage.getByRole('complementary').getByRole('navigation');
  for (const name of ['Home', 'Users', 'Tasks', 'Audits']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
});
