import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { file } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { fixtureUser, workerRole } from '../fixtures/users';
import { userIdOf } from '../utils/admin-users';
import { openCardMenu, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';
import { storedFile } from '../utils/uploads';

test('an admin restores one deleted file and purges the other, checked on the bucket', async ({
  adminPage,
  workerPage,
  workerRequest,
  bucket,
  corpus,
  db,
}, testInfo) => {
  const owner = fixtureUser(workerRole(testInfo.parallelIndex));
  const prefix = uniquePrefix('deleted');
  const [restored, purged] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt'), corpus.file('data.json')]);
  const before = {
    restored: await storedFile(db, bucket, restored!.title),
    purged: await storedFile(db, bucket, purged!.title),
  };

  // The worker deletes both of its files from the Files screen.
  await openOwnFiles(workerPage, prefix, 2);
  for (const doomed of [restored!, purged!]) {
    await openCardMenu(workerPage, doomed.title);
    await workerPage.getByRole('menuitem', { name: 'Delete' }).click();
    await workerPage.getByRole('alertdialog', { name: 'Delete this file?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(workerPage.getByText('File deleted')).toBeVisible();
  }
  await openOwnFiles(workerPage, prefix, 0);

  // Both are listed under the owner on the admin screen.
  await adminPage.goto('/admin/tasks/deleted-files');
  await expect(adminPage).toHaveTitle('Deleted Files | LunaShare');
  await expect(adminPage.getByText('Deleted Files Management', { exact: true })).toBeVisible();
  const expand = async () => {
    await expect(async () => {
      await adminPage.getByText(owner.name, { exact: true }).click();
      await expect(adminPage.getByText(restored!.title, { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  };
  await expand();
  await expect(adminPage.getByText(purged!.title, { exact: true })).toBeVisible();
  const restoredRow = adminPage.locator('div', { has: adminPage.getByLabel(`Select ${restored!.title}`) }).last();

  // Restore one: it is back in the owner's Files and its object is unchanged.
  await restoredRow.getByRole('button', { name: 'Restore file' }).click();
  const restoreDialog = adminPage.getByRole('alertdialog', { name: 'Restore Files' });
  await expect(restoreDialog).toContainText('restore 1 file(s)');
  await restoreDialog.getByRole('button', { name: 'Restore Files' }).click();
  await expect(adminPage.getByText('Restored 1 files')).toBeVisible();
  await expect(adminPage.getByText(restored!.title, { exact: true })).toBeHidden();

  await openOwnFiles(workerPage, prefix, 1);
  await expect(workerPage.getByRole('button', { name: restored!.title, exact: true })).toBeVisible();
  const after = await storedFile(db, bucket, restored!.title);
  expect(after.key).toBe(before.restored.key);
  expect(after.bytes.equals(before.restored.bytes)).toBe(true);

  // Purge the other: gone from the list, the database and the bucket.
  await adminPage.getByLabel(`Select ${purged!.title}`).check();
  await adminPage.getByRole('button', { name: 'Permanently Delete (1)' }).click();
  const purgeDialog = adminPage.getByRole('alertdialog', { name: 'Permanently Delete Files' });
  await purgeDialog.getByRole('button', { name: 'Permanently Delete' }).click();
  await expect(adminPage.getByText('Permanently deleted 1 files and 1 S3 objects')).toBeVisible();
  await expect(adminPage.getByText(purged!.title, { exact: true })).toBeHidden();

  expect(await db.select({ id: file.id }).from(file).where(eq(file.id, purged!.id))).toHaveLength(0);
  const ownerId = await userIdOf(db, owner.email);
  expect(before.purged.key.startsWith(`${ownerId}/`)).toBe(true);
  await expect(bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: before.purged.key }))).rejects.toMatchObject({
    name: 'NotFound',
  });
  await bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: before.restored.key }));
});
