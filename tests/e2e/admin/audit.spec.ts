import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { user } from '../../../src/db/schema/auth';
import { test } from '../fixtures/test';
import { stackEnv } from '../stack-env';
import { createUserThroughAdmin, signedInDevice, throwawayUser, userIdOf } from '../utils/admin-users';
import { clickUntil } from '../utils/hydration';
import { uniquePrefix, uploadOwnFiles } from '../utils/own-files';

// Audited admin writes show up in /admin/audit with the admin as actor and the target as record.
// Searching the audit list for a record id narrows it to that record's entries.

test('creating a user, changing its quota and deleting its file are audited with the admin as actor', async ({
  adminPage,
  browser,
  corpus,
  db,
}) => {
  const [admin] = await db.select({ name: user.name }).from(user).where(eq(user.email, stackEnv().E2E_ADMIN_EMAIL));
  const account = throwawayUser('audit');
  await adminPage.goto('/admin/users');
  await createUserThroughAdmin(adminPage, account);
  const userId = await userIdOf(db, account.email);

  await adminPage.goto(`/admin/users/${userId}`);
  const input = adminPage.getByLabel('Storage Quota');
  const toast = adminPage.getByText('Storage quota updated');
  await expect(async () => {
    await input.fill('0.5');
    await adminPage.getByRole('button', { name: 'Save storage quota' }).click();
    await expect(toast).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });

  const reset = adminPage.getByRole('dialog', { name: 'Reset password' });
  await clickUntil(adminPage.getByRole('button', { name: 'Reset password' }), reset);
  await reset.getByLabel('New password').fill(`new-${account.password}`);
  await reset.getByRole('button', { name: 'Reset password' }).click();
  await expect(adminPage.getByText(`Password reset. ${account.name} has been signed out everywhere.`)).toBeVisible();

  const device = await signedInDevice(browser, { ...account, password: `new-${account.password}` });
  const [upload] = await uploadOwnFiles(device.request, uniquePrefix('audit'), [corpus.file('notes.txt')]);
  await adminPage.goto(`/admin/users/${userId}/files`);
  await adminPage.getByRole('button', { name: 'Delete file' }).click();
  await adminPage.getByRole('dialog', { name: 'Delete File' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(adminPage.getByText('File deleted successfully')).toBeVisible();

  // Searching a record id narrows the list to that record's entries.
  const searchAudit = async (term: string) => {
    await adminPage.goto('/admin/audit');
    const search = adminPage.getByLabel('Search audit logs');
    await expect(async () => {
      await search.fill(term);
      await expect(adminPage.getByText(`matching "${term}"`)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  };

  await searchAudit(userId);
  const created = adminPage.getByRole('row').filter({ hasText: 'create' });
  await expect(created).toHaveCount(1);
  await expect(created.getByRole('cell').nth(1)).toHaveText('User');
  await expect(created.getByRole('cell').nth(3)).toHaveText(userId);
  await expect(created.getByRole('cell').nth(4)).toHaveText(admin!.name);

  const updates = adminPage.getByRole('row').filter({ hasText: 'update' });
  await expect(updates).toHaveCount(2);
  for (const update of await updates.all()) {
    await expect(update.getByRole('cell').nth(4)).toHaveText(admin!.name);
  }

  const quotaUpdate = updates.filter({ hasText: 'storageQuotaMiB' });
  await expect(quotaUpdate).toHaveCount(1);
  await quotaUpdate.getByRole('link', { name: 'View Details' }).click();
  await expect(adminPage.getByRole('heading', { name: 'Audit Detail' })).toBeVisible();
  const detail = adminPage.getByRole('definition');
  await expect(adminPage.getByText('Audit Information')).toBeVisible();
  await expect(detail.getByText('User', { exact: true }).first()).toBeVisible();
  await expect(detail.getByText(admin!.name, { exact: true })).toBeVisible();
  await expect(detail.getByText(userId, { exact: true })).toBeVisible();

  // The deleted file: who deleted it, and the creation by its owner.
  await searchAudit(upload!.id);
  const deleted = adminPage.getByRole('row').filter({ hasText: 'delete' });
  await expect(deleted).toHaveCount(1);
  await expect(deleted.getByRole('cell').nth(1)).toHaveText('File');
  await expect(deleted.getByRole('cell').nth(4)).toHaveText(admin!.name);
  await expect(adminPage.getByRole('row').filter({ hasText: 'create' }).getByRole('cell').nth(4)).toHaveText(account.name);
});
