import { expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { vaultEntry } from '../../../src/db/schema/admin';
import { test } from '../fixtures/test';
import { clickUntil } from '../utils/hydration';

// The Vault applies to every User, so this file runs in the `instance-wide` project after the rest of the suite
// (playwright.config.ts) and clears what it set. The stack configures storage, fal, signing and proxy hops through env,
// which wins over the Vault; PROXY_ALLOWED_DOMAINS is the one entry it leaves unset.

test.describe.configure({ mode: 'serial' });

const entry = (page: Page, name: string) => page.getByTestId(`vault-entry-${name}`);

async function openVault(adminPage: Page) {
  await adminPage.goto('/admin/settings');
  await adminPage.getByRole('link', { name: /^Vault / }).click();
  await expect(adminPage).toHaveTitle('Vault | LunaShare');
}

test('an entry the environment sets can be stored ahead, and the environment keeps winning', async ({ adminPage, stack, db }) => {
  await openVault(adminPage);
  await expect(entry(adminPage, 'AWS_SECRET_ACCESS_KEY').getByText('From environment')).toBeVisible();
  await expect(adminPage.getByText('Storage is not configured')).toHaveCount(0);
  expect(await adminPage.content()).not.toContain(stack.E2E_S3_SECRET_ACCESS_KEY);

  // The stack sets TRUSTED_PROXY_HOPS=1 in env; storing the same value keeps every other spec's rate-limit buckets intact.
  const row = entry(adminPage, 'TRUSTED_PROXY_HOPS');
  try {
    await clickUntil(row.getByRole('button', { name: 'Set' }), adminPage.getByRole('dialog'));
    const dialog = adminPage.getByRole('dialog');
    await expect(dialog.getByText('The environment sets this entry and keeps winning.')).toBeVisible();
    await dialog.getByLabel('Value').fill('1');
    await dialog.getByLabel('Your password').fill(stack.E2E_ADMIN_PASSWORD);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    await expect(row.getByText('From environment')).toBeVisible();
    await expect(row.getByText('A value is also stored in the Vault; the environment overrides it.')).toBeVisible();
    expect(await db.select().from(vaultEntry).where(eq(vaultEntry.name, 'TRUSTED_PROXY_HOPS'))).toHaveLength(1);

    await row.getByRole('button', { name: 'Clear' }).click();
    await adminPage.getByRole('dialog').getByLabel('Your password').fill(stack.E2E_ADMIN_PASSWORD);
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Clear' }).click();
    await expect(row.getByText('A value is also stored in the Vault')).toHaveCount(0);
  } finally {
    await db.delete(vaultEntry).where(eq(vaultEntry.name, 'TRUSTED_PROXY_HOPS'));
  }
});

test('an entry is set and cleared only with the admin password, and stored encrypted', async ({ adminPage, stack, db }) => {
  const host = `zz-e2e-${Date.now()}.example.com`;
  await openVault(adminPage);
  const row = entry(adminPage, 'PROXY_ALLOWED_DOMAINS');
  await expect(row.getByText('Not set')).toBeVisible();

  try {
    await clickUntil(row.getByRole('button', { name: 'Set' }), adminPage.getByRole('dialog'));
    const dialog = adminPage.getByRole('dialog');
    await dialog.getByLabel('Value').fill(host);
    await dialog.getByLabel('Your password').fill('not-the-password');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(adminPage.getByText('That password is not correct.')).toBeVisible();
    expect(await db.select().from(vaultEntry).where(eq(vaultEntry.name, 'PROXY_ALLOWED_DOMAINS'))).toHaveLength(0);

    await dialog.getByLabel('Your password').fill(stack.E2E_ADMIN_PASSWORD);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(row.getByText('In Vault')).toBeVisible();
    await expect(row.getByText(host)).toBeVisible();

    const [stored] = await db.select().from(vaultEntry).where(eq(vaultEntry.name, 'PROXY_ALLOWED_DOMAINS'));
    expect(stored?.ciphertext).toBeDefined();
    expect(stored?.ciphertext).not.toContain(host);

    await row.getByRole('button', { name: 'Clear' }).click();
    await adminPage.getByRole('dialog').getByLabel('Your password').fill(stack.E2E_ADMIN_PASSWORD);
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Clear' }).click();
    await expect(row.getByText('Not set')).toBeVisible();
  } finally {
    await db.delete(vaultEntry).where(eq(vaultEntry.name, 'PROXY_ALLOWED_DOMAINS'));
  }
});
