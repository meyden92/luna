import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { file } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { fileCards, scopeRow } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import { cardOf, createFolderThroughSidebar, openCardMenu, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';
import { previewOf } from '../utils/preview';

// Acting on a file from inside the Preview, as a worker user on files the spec uploaded itself.

test('Folder moves the file; the list shows it in that folder after closing', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('pv-move');
  const folderName = `${prefix}-target`;
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, folderName);
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  await clickUntil(cardOf(workerPage, uploaded!.title), previewOf(workerPage, uploaded!.title));
  const preview = previewOf(workerPage, uploaded!.title);

  await preview.getByRole('combobox').click();
  await workerPage.getByRole('option', { name: folderName }).click();
  await expect(workerPage.getByText(`File moved to “${folderName}”`)).toBeVisible();
  await expect(preview.getByRole('combobox')).toContainText(folderName);

  await workerPage.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await expect(scopeRow(workerPage, folderName)).toHaveAccessibleName(`${folderName} 1`);
  await clickUntil(scopeRow(workerPage, folderName), workerPage.getByRole('heading', { level: 1, name: folderName }));
  await expect(cardOf(workerPage, uploaded!.title)).toBeVisible();
});

test('the Private switch toggles visibility; the card shows it after closing', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('pv-private');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  await clickUntil(cardOf(workerPage, uploaded!.title), previewOf(workerPage, uploaded!.title));
  const preview = previewOf(workerPage, uploaded!.title);
  const privateSwitch = preview.getByRole('switch', { name: 'Private' });
  await expect(privateSwitch).not.toBeChecked();

  await privateSwitch.click();
  await expect(workerPage.getByText('Made private')).toBeVisible();
  await expect(privateSwitch).toBeChecked();
  await workerPage.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  const card = cardOf(workerPage, uploaded!.title);
  await card.hover();
  await card.getByRole('button', { name: 'More actions' }).click();
  await expect(workerPage.getByRole('menuitem', { name: 'Make public' })).toBeVisible();
  await workerPage.keyboard.press('Escape');

  await clickUntil(card, preview);
  await privateSwitch.click();
  await expect(workerPage.getByText('Made public')).toBeVisible();
  await expect(privateSwitch).not.toBeChecked();
});

test('Delete file confirms, removes the file and moves the Preview to its neighbour', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('pv-delete');
  const files = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt'), corpus.file('readme.md'), corpus.file('data.json')]);
  await openOwnFiles(workerPage, prefix, 3);
  const listed = await fileCards(workerPage).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''));
  expect(listed.sort()).toEqual(files.map((f) => f.title).sort());
  const [first, second, third] = await fileCards(workerPage).evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('aria-label') ?? ''),
  );

  await clickUntil(cardOf(workerPage, second!), previewOf(workerPage, second!));
  await previewOf(workerPage, second!).getByRole('button', { name: 'Delete file' }).click();
  await expect(workerPage.getByRole('alertdialog', { name: 'Delete this file?' })).toBeVisible();
  await workerPage.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(workerPage.getByText('File deleted')).toBeVisible();
  // The deleted file is gone from the stage and from the list; the neighbour is what is left to step to.
  await expect(previewOf(workerPage, second!)).toBeHidden();
  await expect(cardOf(workerPage, second!)).toHaveCount(0);
  await expect(fileCards(workerPage)).toHaveCount(2);
  await expect(cardOf(workerPage, first!)).toBeVisible();
  await expect(cardOf(workerPage, third!)).toBeVisible();
});

test('the Delete key opens the same confirmation, and Cancel keeps the file', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('pv-delkey');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  await clickUntil(cardOf(workerPage, uploaded!.title), previewOf(workerPage, uploaded!.title));

  await workerPage.keyboard.press('Delete');
  await expect(workerPage.getByRole('alertdialog', { name: 'Delete this file?' })).toBeVisible();
  await workerPage.getByRole('button', { name: 'Cancel' }).click();

  await expect(workerPage.getByRole('alertdialog')).toBeHidden();
  await expect(previewOf(workerPage, uploaded!.title)).toBeVisible();
  await workerPage.keyboard.press('Escape');
  await expect(cardOf(workerPage, uploaded!.title)).toBeVisible();
});

test('Name and Tags save from the Preview and survive a reload', async ({ workerPage, workerRequest, corpus, db }) => {
  const prefix = uniquePrefix('pv-rename');
  const renamed = `${prefix} renamed.txt`;
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  await clickUntil(cardOf(workerPage, uploaded!.title), previewOf(workerPage, uploaded!.title));

  const nameField = previewOf(workerPage, uploaded!.title).getByRole('textbox', { name: 'Name' });
  await nameField.fill(renamed);
  await nameField.press('Enter');
  const preview = previewOf(workerPage, renamed);
  await expect(preview).toBeVisible();

  const tagField = preview.getByRole('textbox', { name: 'Add a tag' });
  await tagField.fill('Holiday');
  await tagField.press('Enter');
  await expect(preview.getByRole('button', { name: 'Remove holiday' })).toBeVisible();
  await expect
    .poll(async () => (await db.select({ tags: file.tags }).from(file).where(eq(file.title, renamed)))[0]?.tags ?? '')
    .toContain('holiday');

  // openOwnFiles loads the page afresh, so the tag below comes from the server.
  await openOwnFiles(workerPage, prefix, 1);
  await clickUntil(cardOf(workerPage, renamed), previewOf(workerPage, renamed));
  await expect(previewOf(workerPage, renamed).getByRole('button', { name: 'Remove holiday' })).toBeVisible();
});

test('an empty name is put back rather than saved', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('pv-noname');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  await clickUntil(cardOf(workerPage, uploaded!.title), previewOf(workerPage, uploaded!.title));

  const nameField = previewOf(workerPage, uploaded!.title).getByRole('textbox', { name: 'Name' });
  await nameField.fill('   ');
  await nameField.press('Enter');
  await expect(nameField).toHaveValue(uploaded!.title);
});

test('the card menu’s Rename opens the Preview with the name selected', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('pv-menurename');
  const [uploaded] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  await openCardMenu(workerPage, uploaded!.title);
  await workerPage.getByRole('menuitem', { name: 'Rename' }).click();

  const nameField = previewOf(workerPage, uploaded!.title).getByRole('textbox', { name: 'Name' });
  await expect(nameField).toBeFocused();
  // Typing replaces the whole selected name.
  await workerPage.keyboard.type(`${prefix} typed.txt`);
  await workerPage.keyboard.press('Enter');
  await expect(previewOf(workerPage, `${prefix} typed.txt`)).toBeVisible();
});
