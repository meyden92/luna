import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { test } from '../fixtures/test';
import { cardTitles, fileCards, scopeRow } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import {
  cardOf,
  createFolderThroughSidebar,
  folderIdOf,
  type OwnFile,
  openOwnFiles,
  uniquePrefix,
  uploadOwnFiles,
} from '../utils/own-files';

// The SelectionBar's actions: move, delete, zip download and copy links.

const selectionBar = (page: Page) => page.getByRole('toolbar', { name: 'Selected files' });

const expectSelected = (page: Page, n: number) => expect(selectionBar(page).getByLabel(String(n), { exact: true })).toBeVisible();

async function select(page: Page, files: readonly OwnFile[]): Promise<void> {
  for (const { title } of files) await cardOf(page, title).getByRole('button', { name: 'Select', exact: true }).click();
  await expectSelected(page, files.length);
}

/** Switches Scope (narrowed to the spec's files by the search the page already holds). */
const openScope = (page: Page, name: string) => clickUntil(scopeRow(page, name), page.getByRole('heading', { level: 1, name }));

const sortedTitles = async (page: Page) => (await cardTitles(page)).sort();

test.describe('move', () => {
  test('moving a selection puts the files in the folder and takes them out of the source', async ({
    workerPage,
    workerRequest,
    corpus,
  }) => {
    const prefix = uniquePrefix('bulk-move');
    const folderName = `${prefix}-target`;
    await workerPage.goto('/dashboard');
    await createFolderThroughSidebar(workerPage, folderName);
    const [a, b, c] = await uploadOwnFiles(workerRequest, prefix, [
      corpus.file('notes.txt'),
      corpus.file('data.json'),
      corpus.file('readme.md'),
    ]);
    await openOwnFiles(workerPage, prefix, 3);
    await select(workerPage, [a!, b!]);

    await selectionBar(workerPage).getByRole('button', { name: 'Move to' }).click();
    await workerPage.getByRole('menuitem', { name: new RegExp(folderName) }).click();

    await expect(workerPage.getByText(`2 files moved to “${folderName}”`)).toBeVisible();
    await expect(selectionBar(workerPage)).toBeHidden();
    await expect(scopeRow(workerPage, folderName)).toHaveAccessibleName(`${folderName} 2`);

    // What the server holds, not the optimistic cache: reload, then look at each Scope.
    await openOwnFiles(workerPage, prefix, 3);
    await openScope(workerPage, folderName);
    await expect(fileCards(workerPage)).toHaveCount(2);
    expect(await sortedTitles(workerPage)).toEqual([a!.title, b!.title].sort());

    await openScope(workerPage, 'Not in a folder');
    await expect(fileCards(workerPage)).toHaveCount(1);
    expect(await sortedTitles(workerPage)).toEqual([c!.title]);
  });

  test('moving files out of a folder returns them to no folder', async ({ workerPage, workerRequest, db, corpus }) => {
    const prefix = uniquePrefix('bulk-moveout');
    const folderName = `${prefix}-source`;
    await workerPage.goto('/dashboard');
    await createFolderThroughSidebar(workerPage, folderName);
    const files = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt'), corpus.file('data.json')], {
      folderId: await folderIdOf(db, folderName),
    });
    await openOwnFiles(workerPage, prefix, 2);
    await openScope(workerPage, folderName);
    await expect(fileCards(workerPage)).toHaveCount(2);
    await select(workerPage, files);

    await selectionBar(workerPage).getByRole('button', { name: 'Move to' }).click();
    await workerPage.getByRole('menuitem', { name: 'Not in a folder' }).click();

    await expect(workerPage.getByText('2 files moved out of the folder')).toBeVisible();
    await expect(fileCards(workerPage)).toHaveCount(0);
    await openOwnFiles(workerPage, prefix, 2);
    await openScope(workerPage, 'Not in a folder');
    await expect(fileCards(workerPage)).toHaveCount(2);
    await expect(scopeRow(workerPage, folderName)).toHaveAccessibleName(`${folderName} 0`);
  });
});

test.describe('delete', () => {
  test('cancelling the dialog changes nothing, confirming removes the files and frees their storage', async ({
    workerPage,
    workerRequest,
    corpus,
  }) => {
    const prefix = uniquePrefix('bulk-delete');
    const files = await uploadOwnFiles(workerRequest, prefix, [
      corpus.file('large-log.txt'),
      corpus.file('notes.txt'),
      corpus.file('data.json'),
    ]);
    await openOwnFiles(workerPage, prefix, 3);
    const storage = workerPage.getByRole('complementary', { name: 'Folders' }).locator('b');
    const usedBefore = await storage.innerText();
    await select(workerPage, files);

    await selectionBar(workerPage).getByRole('button', { name: 'Delete' }).click();
    const dialog = workerPage.getByRole('alertdialog', { name: 'Delete 3 files?' });
    await expect(dialog).toContainText('Anyone with the link will lose access. This can’t be undone.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(dialog).toBeHidden();
    await expect(fileCards(workerPage)).toHaveCount(3);
    await expectSelected(workerPage, 3);

    await selectionBar(workerPage).getByRole('button', { name: 'Delete' }).click();
    await workerPage.getByRole('alertdialog', { name: 'Delete 3 files?' }).getByRole('button', { name: 'Delete' }).click();

    await expect(workerPage.getByText('3 files deleted')).toBeVisible();
    await expect(fileCards(workerPage)).toHaveCount(0);
    await expect(selectionBar(workerPage)).toBeHidden();

    // Gone for good from the server's point of view, and the storage meter went down.
    await workerPage.reload();
    await expect(workerPage.getByRole('complementary', { name: 'Folders' })).toBeVisible();
    await openOwnFiles(workerPage, prefix, 0);
    await expect(workerPage.getByText('No files match')).toBeVisible();
    await expect(storage).not.toHaveText(usedBefore);
  });

  test('deleting one file of a selection leaves the others', async ({ workerPage, workerRequest, corpus }) => {
    const prefix = uniquePrefix('bulk-delete-one');
    const [a, b] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt'), corpus.file('data.json')]);
    await openOwnFiles(workerPage, prefix, 2);
    await select(workerPage, [a!]);

    await selectionBar(workerPage).getByRole('button', { name: 'Delete' }).click();
    await workerPage.getByRole('alertdialog', { name: 'Delete this file?' }).getByRole('button', { name: 'Delete' }).click();

    await expect(workerPage.getByText('File deleted')).toBeVisible();
    await expect(cardOf(workerPage, a!.title)).toHaveCount(0);
    await expect(cardOf(workerPage, b!.title)).toBeVisible();
  });
});

test.describe('download and copy', () => {
  test('Download zips exactly the selected files with their bytes', async ({ workerPage, workerRequest, corpus }) => {
    const prefix = uniquePrefix('bulk-zip');
    const selected = await uploadOwnFiles(workerRequest, prefix, [
      corpus.file('notes.txt'),
      corpus.file('icon-small.png'),
      corpus.file('data.json'),
    ]);
    const [left] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('readme.md')]);
    await openOwnFiles(workerPage, prefix, 4);
    await select(workerPage, selected);

    const download = workerPage.waitForEvent('download');
    await selectionBar(workerPage).getByRole('button', { name: 'Download' }).click();
    const zip = await download;

    expect(zip.suggestedFilename()).toBe('lunashare-files.zip');
    const entries = unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
    expect(Object.keys(entries).sort()).toEqual(selected.map((f) => f.title).sort());
    expect(Object.keys(entries)).not.toContain(left!.title);
    for (const { title, entry } of selected) {
      expect(Buffer.from(entries[title]!).equals(readFileSync(entry.path)), `${title} bytes`).toBe(true);
    }
  });

  test('Copy links puts every selected file’s view link on the clipboard', async ({ workerPage, workerRequest, corpus }) => {
    const prefix = uniquePrefix('bulk-links');
    const files = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt'), corpus.file('data.json')]);
    await workerPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openOwnFiles(workerPage, prefix, 2);
    await select(workerPage, files);

    await selectionBar(workerPage).getByRole('button', { name: 'Copy links' }).click();

    await expect(workerPage.getByText('2 links copied')).toBeVisible();
    const origin = new URL(workerPage.url()).origin;
    const clipboard = await workerPage.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.split('\n').sort()).toEqual(files.map((f) => `${origin}/view/${f.id}`).sort());
  });
});
