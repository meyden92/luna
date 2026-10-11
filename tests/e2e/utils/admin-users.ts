import { randomBytes } from 'node:crypto';
import { type Browser, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { user } from '../../../src/db/schema/auth';
import type { TestDb } from '../fixtures/db';
import { clientIpHeader, type FixtureUser } from '../fixtures/users';
import { clickUntil } from './hydration';
import { signInThroughForm } from './sign-in';

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

/**
 * Credentials for a user only this test knows. The email sorts after every fixture
 * user (`zz-`), so the admin list's first page keeps showing the fixtures. Create it
 * with `createUserThroughAdmin`.
 */
export function throwawayUser(label: string): FixtureUser {
  const tag = randomBytes(3).toString('hex');
  return {
    role: 'worker900',
    username: `e2e-${label}-${tag}`,
    name: `${label} ${tag}`,
    email: `zz-${label}-${tag}@lunashare.test`,
    password: `pw-${randomBytes(9).toString('base64url')}`,
  };
}

/** A page in its own context and address, signed in as `account` through the login form. */
export async function signedInDevice(browser: Browser, account: FixtureUser): Promise<Page> {
  const context = await browser.newContext({ extraHTTPHeaders: clientIpHeader() });
  const page = await context.newPage();
  await signInThroughForm(page, account.username, account.password);
  return page;
}

/** The id of the user with this (test-unique) email. */
export async function userIdOf(db: TestDb, email: string): Promise<string> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!row) throw new Error(`No user with email ${email}`);
  return row.id;
}
