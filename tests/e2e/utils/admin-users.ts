import { expect, type Page } from '@playwright/test';
import type { FixtureUser } from '../fixtures/users';
import { clickUntil } from './hydration';

/** Fills the admin users screen's "Create user" dialog (the page is on /admin/users) and waits for the confirmation toast. */
export async function createUserThroughAdmin(page: Page, user: FixtureUser): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Create user' });
  await clickUntil(page.getByRole('button', { name: 'Create user' }), dialog);

  // The form drops a submit fired while the Username availability check is in
  // flight, so let that check answer first.
  const availability = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/is-username-available');
  await dialog.getByLabel('Username').fill(user.username);
  await availability;
  await dialog.getByLabel('Display name').fill(user.name);
  await dialog.getByLabel('Email').fill(user.email);
  await dialog.getByLabel('Initial password').fill(user.password);
  await dialog.getByRole('button', { name: 'Create user' }).click();

  await expect(page.getByText(`${user.name} can now sign in as "${user.username}"`)).toBeVisible();
  await expect(dialog).toBeHidden();
}
