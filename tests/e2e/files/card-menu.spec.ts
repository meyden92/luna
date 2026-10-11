import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { file } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { fileCards, scopeRow } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import { cardOf, createFolderThroughSidebar, openCardMenu, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';

// Everything on one file card: its chips and its ⋯ menu.

test('Open direct link opens the stored object in a new tab', async ({ workerPage, workerRequest, db, corpus }) => {
  const prefix = uniquePrefix('card-direct');
  const icon = corpus.file('icon-small.png');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [icon]);
  const [row] = await db.select({ url: file.url }).from(file).where(eq(file.id, uploaded!.id));
  await openOwnFiles(workerPage, prefix, 1);
  await openCardMenu(workerPage, uploaded!.title);

  const popupEvent = workerPage.context().waitForEvent('page');
  await workerPage.getByRole('menuitem', { name: 'Open direct link' }).click();
  const popup = await popupEvent;
  await popup.waitForLoadState();

  expect(popup.url()).toContain(row!.url);
  // The browser shows the bare image: the object loaded with its real size.
  await expect(popup.locator('img')).toHaveJSProperty('naturalWidth', icon.dimensions!.width);
  await expect(popup.locator('img')).toHaveJSProperty('naturalHeight', icon.dimensions!.height);
});

test('Download saves the file under its title with its bytes', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('card-download');
  const notes = corpus.file('data.json');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [notes]);
  await openOwnFiles(workerPage, prefix, 1);
  await openCardMenu(workerPage, uploaded!.title);

  const downloadEvent = workerPage.waitForEvent('download');
  await workerPage.getByRole('menuitem', { name: 'Download' }).click();
  const download = await downloadEvent;

  expect(download.suggestedFilename()).toBe(uploaded!.title);
  expect(readFileSync((await download.path())!).equals(readFileSync(notes.path))).toBe(true);
});

test('Download keeps a Unicode title with spaces and an emoji', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('card-unicode');
  const notes = corpus.file('notes.txt');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [notes], { titleFor: () => `${prefix} Ünïcödé 🌙 holiday notes.txt` });
  await openOwnFiles(workerPage, prefix, 1);
  await openCardMenu(workerPage, uploaded!.title);

  const downloadEvent = workerPage.waitForEvent('download');
  await workerPage.getByRole('menuitem', { name: 'Download' }).click();
  const download = await downloadEvent;

  expect(download.suggestedFilename()).toBe(uploaded!.title);
  expect(readFileSync((await download.path())!).equals(readFileSync(notes.path))).toBe(true);
});

test('Move to folder files the card in the folder', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('card-move');
  const folderName = `${prefix}-target`;
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, folderName);
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  await openCardMenu(workerPage, uploaded!.title);

  await workerPage.getByRole('menuitem', { name: 'Move to folder' }).click();
  await workerPage.getByRole('menuitem', { name: new RegExp(folderName) }).click();

  await expect(workerPage.getByText(`File moved to “${folderName}”`)).toBeVisible();
  await expect(scopeRow(workerPage, folderName)).toHaveAccessibleName(`${folderName} 1`);
  await openOwnFiles(workerPage, prefix, 1);
  await clickUntil(scopeRow(workerPage, folderName), workerPage.getByRole('heading', { level: 1, name: folderName }));
  await expect(cardOf(workerPage, uploaded!.title)).toBeVisible();
  await clickUntil(scopeRow(workerPage, 'Not in a folder'), workerPage.getByRole('heading', { level: 1, name: 'Not in a folder' }));
  await expect(fileCards(workerPage)).toHaveCount(0);
});

test('Make private hides the file from visitors and Make public shows it again', async ({ workerPage, workerRequest, page, corpus }) => {
  const prefix = uniquePrefix('card-privacy');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  const view = `/view/${uploaded!.id}`;
  await openOwnFiles(workerPage, prefix, 1);
  await page.goto(view);
  await expect(page.getByRole('heading', { level: 1, name: uploaded!.title })).toBeVisible();

  await openCardMenu(workerPage, uploaded!.title);
  await workerPage.getByRole('menuitem', { name: 'Make private' }).click();

  await expect(workerPage.getByText('Made private')).toBeVisible();
  await expect(cardOf(workerPage, uploaded!.title).getByTitle('Private')).toBeVisible();
  await page.reload();
  await expect(page.getByText('This file is private')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to view' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: uploaded!.title })).toHaveCount(0);

  await openCardMenu(workerPage, uploaded!.title);
  await workerPage.getByRole('menuitem', { name: 'Make public' }).click();

  await expect(workerPage.getByText('Made public')).toBeVisible();
  await expect(cardOf(workerPage, uploaded!.title).getByTitle('Private')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: uploaded!.title })).toBeVisible();
});

test('Copy link puts the file’s /view link on the clipboard', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('card-link');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await workerPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openOwnFiles(workerPage, prefix, 1);
  const card = cardOf(workerPage, uploaded!.title);
  await card.hover();

  await card.getByRole('button', { name: 'Copy link', exact: true }).click();

  await expect(workerPage.getByText('Link copied')).toBeVisible();
  const origin = new URL(workerPage.url()).origin;
  expect(await workerPage.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/view/${uploaded!.id}`);
});

test('Delete asks first: Cancel keeps the file, Delete removes it', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('card-delete');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  await openCardMenu(workerPage, uploaded!.title);
  await workerPage.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = workerPage.getByRole('alertdialog', { name: 'Delete this file?' });
  await expect(dialog).toContainText('Anyone with the link will lose access. This can’t be undone.');

  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).toBeHidden();
  await expect(cardOf(workerPage, uploaded!.title)).toBeVisible();

  await openCardMenu(workerPage, uploaded!.title);
  await workerPage.getByRole('menuitem', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(workerPage.getByText('File deleted')).toBeVisible();
  await expect(fileCards(workerPage)).toHaveCount(0);
  await openOwnFiles(workerPage, prefix, 0);
  await expect(workerPage.getByText('No files match')).toBeVisible();
});
