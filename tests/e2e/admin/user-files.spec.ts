import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { fixtureUser } from '../fixtures/users';
import { createUserThroughAdmin, signedInDevice, throwawayUser, userIdOf } from '../utils/admin-users';
import { openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';
import { bucketKeysContaining } from '../utils/uploads';

test("the gallery user's files are listed 50 to a page with the expected total", async ({ adminPage, db, gallery }) => {
  const owner = fixtureUser('gallery');
  const id = await userIdOf(db, owner.email);
  await adminPage.goto(`/admin/users/${id}/files`);

  await expect(adminPage).toHaveTitle('User Files | LunaShare');
  await expect(adminPage.getByRole('heading', { name: `${owner.name}'s Files` })).toBeVisible();
  await expect(adminPage.getByText(`(${gallery.files.length} total files)`)).toBeVisible();
  await expect(adminPage.getByText(`Showing 1-50 of ${gallery.files.length} files`)).toBeVisible();
  await expect(adminPage.getByRole('row')).toHaveCount(51);

  await adminPage.getByRole('button', { name: 'Next' }).click();
  await expect(adminPage.getByText(`Showing 51-100 of ${gallery.files.length} files`)).toBeVisible();
});

test("an admin deletes one file of a user; it leaves that user's Files and the bucket", async ({
  adminPage,
  browser,
  bucket,
  corpus,
  db,
}) => {
  const account = throwawayUser('files');
  await adminPage.goto('/admin/users');
  await createUserThroughAdmin(adminPage, account);
  const id = await userIdOf(db, account.email);
  const device = await signedInDevice(browser, account);
  const prefix = uniquePrefix('admin-delete');
  const [doomed, kept] = await uploadOwnFiles(device.request, prefix, [corpus.file('notes.txt'), corpus.file('data.json')]);
  expect(await bucketKeysContaining(bucket, id, '')).toHaveLength(2);

  await adminPage.goto(`/admin/users/${id}/files`);
  await expect(adminPage.getByText('(2 total files)')).toBeVisible();
  const row = adminPage.getByRole('row').filter({ hasText: doomed!.title });
  await row.getByRole('button', { name: 'Delete file' }).click();
  const dialog = adminPage.getByRole('dialog', { name: 'Delete File' });
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(adminPage.getByText('File deleted successfully')).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(adminPage.getByText('(1 total files)')).toBeVisible();

  await openOwnFiles(device, prefix, 1);
  await expect(device.getByRole('button', { name: kept!.title, exact: true })).toBeVisible();
  expect(await bucketKeysContaining(bucket, id, '')).toHaveLength(1);
});
