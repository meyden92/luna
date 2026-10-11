import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { cardTitles, fileCards, scopeRow } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import { cardOf, createFolderThroughSidebar, folderIdOf, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';

// Folders on the Files sidebar: create, rename, delete. All as the worker user, on
// folders and files each test creates under its own unique name. (The app has no
// recolour UI: a folder's colour is picked for it, so there is nothing to test there.)

/** Opens a folder's "Actions for <name>" menu in the sidebar. */
async function openFolderMenu(page: Page, name: string): Promise<void> {
  await scopeRow(page, name).hover();
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
}

test('a new folder appears in the sidebar, empty, and survives a reload', async ({ workerPage }) => {
  const name = uniquePrefix('folder-new');
  await workerPage.goto('/dashboard');

  await createFolderThroughSidebar(workerPage, name);

  await expect(scopeRow(workerPage, name)).toHaveAccessibleName(`${name} 0`);
  await clickUntil(scopeRow(workerPage, name), workerPage.getByRole('heading', { level: 1, name }));
  await expect(workerPage.getByText('This folder is empty')).toBeVisible();

  await workerPage.reload();
  await expect(scopeRow(workerPage, name)).toHaveAccessibleName(`${name} 0`);
});

test('Escape cancels a new folder and nothing is created', async ({ workerPage }) => {
  const name = uniquePrefix('folder-cancel');
  await workerPage.goto('/dashboard');
  const field = workerPage.getByLabel('Folder name');
  await clickUntil(workerPage.getByRole('button', { name: 'New folder' }), field);

  await field.fill(name);
  await field.press('Escape');

  await expect(field).toBeHidden();
  await expect(scopeRow(workerPage, name)).toHaveCount(0);
  await workerPage.reload();
  await expect(workerPage.getByRole('complementary', { name: 'Folders' })).toBeVisible();
  await expect(scopeRow(workerPage, name)).toHaveCount(0);
});

test('renaming a folder changes its name everywhere and keeps its files', async ({ workerPage, workerRequest, db, corpus }) => {
  const prefix = uniquePrefix('folder-rename');
  const oldName = `${prefix}-old`;
  const newName = `${prefix}-new`;
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, oldName);
  const [file] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')], { folderId: await folderIdOf(db, oldName) });

  await openFolderMenu(workerPage, oldName);
  await workerPage.getByRole('menuitem', { name: 'Rename' }).click();
  const field = workerPage.getByLabel('Folder name');
  await field.fill(newName);
  await field.press('Enter');

  await expect(workerPage.getByText('Folder renamed')).toBeVisible();
  await expect(scopeRow(workerPage, newName)).toBeVisible();
  await expect(scopeRow(workerPage, oldName)).toHaveCount(0);

  // After a reload the new name is what the server holds, and the file is still in it.
  await workerPage.reload();
  await expect(scopeRow(workerPage, oldName)).toHaveCount(0);
  await clickUntil(scopeRow(workerPage, newName), workerPage.getByRole('heading', { level: 1, name: newName }));
  await expect(cardOf(workerPage, file!.title)).toBeVisible();
});

test('deleting a folder moves its files out of it and keeps them', async ({ workerPage, workerRequest, db, corpus }) => {
  const prefix = uniquePrefix('folder-delete');
  const name = `${prefix}-folder`;
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, name);
  const files = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt'), corpus.file('data.json')], {
    folderId: await folderIdOf(db, name),
  });
  await workerPage.reload();
  await expect(scopeRow(workerPage, name)).toHaveAccessibleName(`${name} 2`);

  await openFolderMenu(workerPage, name);
  await workerPage.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = workerPage.getByRole('alertdialog', { name: `Delete “${name}”?` });
  await expect(dialog).toContainText('Its 2 files move out of the folder. The files themselves are kept.');
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(workerPage.getByText('Folder deleted · 2 files moved out')).toBeVisible();
  await expect(scopeRow(workerPage, name)).toHaveCount(0);

  // The files are still the user's, now in no folder.
  await workerPage.reload();
  await expect(scopeRow(workerPage, name)).toHaveCount(0);
  await openOwnFiles(workerPage, prefix, 2);
  await clickUntil(scopeRow(workerPage, 'Not in a folder'), workerPage.getByRole('heading', { level: 1, name: 'Not in a folder' }));
  await expect(fileCards(workerPage)).toHaveCount(2);
  expect((await cardTitles(workerPage)).sort()).toEqual(files.map((f) => f.title).sort());
});

test('cancelling the folder delete dialog keeps the folder', async ({ workerPage }) => {
  const name = uniquePrefix('folder-keep');
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, name);

  await openFolderMenu(workerPage, name);
  await workerPage.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = workerPage.getByRole('alertdialog', { name: `Delete “${name}”?` });
  await expect(dialog).toContainText('This can’t be undone.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).toBeHidden();
  await expect(scopeRow(workerPage, name)).toBeVisible();
  await workerPage.reload();
  await expect(scopeRow(workerPage, name)).toBeVisible();
});
