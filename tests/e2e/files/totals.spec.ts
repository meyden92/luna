import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { countLine, fileCount, scopeRow } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import { createFolderThroughSidebar, folderIdOf, openCardMenu, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';
import { uploadFileInput } from '../utils/uploads';

// The totals on the Files screen (head count, sidebar rows, storage meter) follow a change without a reload.
// The worker user's totals include other specs' files, so each test reads them first and asserts the difference.

const storageUsed = (page: Page) => page.getByRole('complementary', { name: 'Folders' }).locator('b');

/** The number a sidebar row carries ("All files 12" → 12); the count's accessible name is the number itself. */
async function sidebarTotal(page: Page, name: string): Promise<number> {
  const count = scopeRow(page, name).locator('[aria-label]');
  await expect(count).toHaveAttribute('aria-label', /^\d+$/);
  return Number(await count.getAttribute('aria-label'));
}

test('deleting a file updates the head count, the sidebar totals and the storage meter', async ({
  workerPage,
  workerRequest,
  corpus,
  db,
}) => {
  const prefix = uniquePrefix('totals-delete');
  const folderName = `${prefix}-folder`;
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, folderName);
  const folderId = await folderIdOf(db, folderName);
  const [big] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('large-log.txt'), corpus.file('notes.txt')], { folderId });
  await openOwnFiles(workerPage, prefix, 2);
  await expect(countLine(workerPage)).toHaveText(`${fileCount(2)} matching “${prefix}”`);
  await expect(scopeRow(workerPage, folderName)).toHaveAccessibleName(`${folderName} 2`);
  const allFiles = await sidebarTotal(workerPage, 'All files');
  const usedBefore = await storageUsed(workerPage).textContent();

  await openCardMenu(workerPage, big!.title);
  await workerPage.getByRole('menuitem', { name: 'Delete' }).click();
  await workerPage.getByRole('alertdialog', { name: 'Delete this file?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(workerPage.getByText('File deleted')).toBeVisible();

  await expect(countLine(workerPage)).toHaveText(`${fileCount(1)} matching “${prefix}”`);
  await expect(scopeRow(workerPage, 'All files')).toHaveAccessibleName(`All files ${allFiles - 1}`);
  await expect(scopeRow(workerPage, folderName)).toHaveAccessibleName(`${folderName} 1`);
  await expect(storageUsed(workerPage)).not.toHaveText(usedBefore ?? '');
});

test('moving a file into a folder updates “Not in a folder”', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('totals-move');
  const folderName = `${prefix}-folder`;
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, folderName);
  const [loose] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  const unfiled = await sidebarTotal(workerPage, 'Not in a folder');

  await openCardMenu(workerPage, loose!.title);
  await workerPage.getByRole('menuitem', { name: 'Move to folder' }).click();
  await workerPage.getByRole('menuitem', { name: new RegExp(folderName) }).click();
  await expect(workerPage.getByText(`File moved to “${folderName}”`)).toBeVisible();

  await expect(scopeRow(workerPage, 'Not in a folder')).toHaveAccessibleName(`Not in a folder ${unfiled - 1}`);
});

test('uploading through the upload sheet updates the head count and “All files”', async ({ workerPage, corpus }) => {
  const entry = corpus.file('notes.txt');
  const title = `${uniquePrefix('totals-upload')} ${entry.name}`;
  await workerPage.goto('/dashboard');
  const allFiles = await sidebarTotal(workerPage, 'All files');
  await expect(countLine(workerPage)).toHaveText(fileCount(allFiles));

  await clickUntil(
    workerPage.getByRole('button', { name: 'Upload', exact: true }).first(),
    workerPage.getByRole('heading', { name: 'Upload files' }),
  );
  await uploadFileInput(workerPage).setInputFiles({ name: title, mimeType: entry.mimeType, buffer: readFileSync(entry.path) });
  await workerPage.getByRole('button', { name: 'Upload 1 file' }).click();
  await expect(workerPage.getByRole('button', { name: title, exact: true })).toBeVisible();

  await expect(countLine(workerPage)).toHaveText(fileCount(allFiles + 1));
  await expect(scopeRow(workerPage, 'All files')).toHaveAccessibleName(`All files ${allFiles + 1}`);
});
