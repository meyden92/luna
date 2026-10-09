import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import type { CorpusEntry } from '../fixtures/corpus';
import { test } from '../fixtures/test';
import { fileCards, scopeRow } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import { cardOf, createFolderThroughSidebar, folderIdOf, uniquePrefix } from '../utils/own-files';
import { previewOf } from '../utils/preview';
import { sizeLabel, storedFile } from '../utils/uploads';

// Uploading through the Upload sheet as the worker user: one file and several, into the
// no-folder Scope and a folder, public and private. Each file is checked where a user sees
// it (card, Preview) and in the bucket.

/** The corpus file as the picker hands it over, under a title no other test uses. */
const asPicked = (prefix: string, entry: CorpusEntry) => ({
  name: `${prefix} ${entry.name}`,
  mimeType: entry.mimeType,
  buffer: readFileSync(entry.path),
});

/** Opens the sheet from the nav's Upload button. */
async function openSheet(page: Page) {
  await page.goto('/dashboard');
  const heading = page.getByRole('heading', { name: 'Upload files' });
  await clickUntil(page.getByRole('button', { name: 'Upload', exact: true }).first(), heading);
  return page.getByRole('dialog', { name: 'Upload files' });
}

/** Narrows the Files screen to a spec's own files, like a user typing in the search box. */
async function search(page: Page, prefix: string, count: number) {
  await page.getByLabel('Search files by name').fill(prefix);
  await expect(fileCards(page)).toHaveCount(count);
}

/** Opens a file's Preview and returns its details panel. */
async function openPreview(page: Page, title: string) {
  await cardOf(page, title).click();
  const preview = previewOf(page, title);
  await expect(preview).toBeVisible();
  return preview.getByRole('complementary');
}

const detail = (panel: ReturnType<Page['locator']>, label: string) => panel.locator(`dt:text-is("${label}") + dd`);

test('one file uploaded from the sheet appears in Files with its size and dimensions, and its bytes are in the bucket', async ({
  workerPage,
  corpus,
  db,
  bucket,
}) => {
  const entry = corpus.file('landscape-photo.jpg');
  const prefix = uniquePrefix('web-one');
  const title = `${prefix} ${entry.name}`;
  await workerPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const sheet = await openSheet(workerPage);

  await workerPage.locator('input[type="file"]').setInputFiles(asPicked(prefix, entry));
  await expect(sheet.getByText(title, { exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Upload 1 file' })).toBeEnabled();
  await sheet.getByRole('button', { name: 'Upload 1 file' }).click();

  await expect(workerPage.getByText('Uploaded · link copied')).toBeVisible();
  await expect(sheet).toBeHidden();
  await search(workerPage, prefix, 1);
  const panel = await openPreview(workerPage, title);
  await expect(detail(panel, 'Type')).toHaveText('JPG');
  await expect(detail(panel, 'Size')).toHaveText(sizeLabel(entry.size));
  await expect(detail(panel, 'Dimensions')).toHaveText(`${entry.dimensions!.width} × ${entry.dimensions!.height}`);

  const stored = await storedFile(db, bucket, title);
  expect(stored.bytes.equals(readFileSync(entry.path))).toBe(true);
  expect(stored.size).toBe(entry.size);
  expect(stored.contentType).toBe('image/jpeg');
  expect(stored.folderId).toBeNull();
  expect(stored.private).toBe(false);
  // The copied link is the file's view page.
  const origin = new URL(workerPage.url()).origin;
  expect(await workerPage.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/view/${stored.id}`);
});

test('several files at once land in the open folder, each of its kind', async ({ workerPage, corpus, db, bucket }) => {
  const prefix = uniquePrefix('web-many');
  const folder = `${prefix}-box`;
  const entries = [corpus.file('transparent-logo.png'), corpus.file('clip.mp4'), corpus.file('tone.mp3'), corpus.file('document.pdf')];
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, folder);
  await clickUntil(scopeRow(workerPage, folder), workerPage.getByRole('heading', { level: 1, name: folder }));

  // The sheet opens on the Scope the Files screen is showing.
  await workerPage.getByRole('button', { name: 'Upload', exact: true }).first().click();
  const sheet = workerPage.getByRole('dialog', { name: 'Upload files' });
  await expect(sheet.getByRole('combobox', { name: 'Folder' })).toHaveText(new RegExp(folder));
  await workerPage.locator('input[type="file"]').setInputFiles(entries.map((entry) => asPicked(prefix, entry)));
  await sheet.getByRole('button', { name: 'Upload 4 files' }).click();

  await expect(workerPage.getByText('Uploaded 4 files')).toBeVisible();
  await expect(sheet).toBeHidden();
  await search(workerPage, prefix, 4);
  await expect(scopeRow(workerPage, folder)).toHaveAccessibleName(`${folder} 4`);

  for (const entry of entries) {
    const title = `${prefix} ${entry.name}`;
    const panel = await openPreview(workerPage, title);
    await expect(detail(panel, 'Size')).toHaveText(sizeLabel(entry.size));
    if (entry.dimensions && entry.kind === 'image') {
      await expect(detail(panel, 'Dimensions')).toHaveText(`${entry.dimensions.width} × ${entry.dimensions.height}`);
    }
    await workerPage.keyboard.press('Escape');
    await expect(previewOf(workerPage, title)).toBeHidden();

    const stored = await storedFile(db, bucket, title);
    expect(stored.bytes.equals(readFileSync(entry.path)), `${entry.name} bytes`).toBe(true);
    expect(stored.contentType).toBe(entry.mimeType);
    expect(stored.folderId).toBe(await folderIdOf(db, folder));
  }

  // The type filters tell the kinds apart.
  for (const [button, entry] of [
    ['Images', entries[0]],
    ['Video', entries[1]],
    ['Audio', entries[2]],
    ['Documents', entries[3]],
  ] as const) {
    await workerPage.getByRole('button', { name: button, exact: true }).click();
    await expect(fileCards(workerPage)).toHaveCount(1);
    await expect(cardOf(workerPage, `${prefix} ${entry!.name}`)).toBeVisible();
  }
});

test('files uploaded to Not in a folder stay out of folders', async ({ workerPage, corpus, db, bucket }) => {
  const prefix = uniquePrefix('web-root');
  const folder = `${prefix}-box`;
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, folder);

  await workerPage.getByRole('button', { name: 'Upload', exact: true }).first().click();
  const sheet = workerPage.getByRole('dialog', { name: 'Upload files' });
  const select = sheet.getByRole('combobox', { name: 'Folder' });
  await expect(select).toHaveText(/Not in a folder/);
  await workerPage
    .locator('input[type="file"]')
    .setInputFiles([asPicked(prefix, corpus.file('notes.txt')), asPicked(prefix, corpus.file('readme.md'))]);
  await sheet.getByRole('button', { name: 'Upload 2 files' }).click();

  await expect(workerPage.getByText('Uploaded 2 files')).toBeVisible();
  await search(workerPage, prefix, 2);
  await expect(scopeRow(workerPage, folder)).toHaveAccessibleName(`${folder} 0`);
  for (const name of ['notes.txt', 'readme.md']) {
    expect((await storedFile(db, bucket, `${prefix} ${name}`)).folderId, name).toBeNull();
  }
});

test('Only me uploads private, Anyone with the link uploads public', async ({ workerPage, corpus, db, bucket }) => {
  const prefix = uniquePrefix('web-vis');
  const entry = corpus.file('notes.txt');
  const privateTitle = `${prefix}-private ${entry.name}`;
  const publicTitle = `${prefix}-public ${entry.name}`;

  let sheet = await openSheet(workerPage);
  await expect(sheet.getByRole('button', { name: 'Anyone with the link' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Only me' }).click();
  await expect(sheet.getByRole('button', { name: 'Only me' })).toHaveAttribute('aria-pressed', 'true');
  await workerPage.locator('input[type="file"]').setInputFiles({ ...asPicked('', entry), name: privateTitle });
  await sheet.getByRole('button', { name: 'Upload 1 file' }).click();
  await expect(workerPage.getByText(/^Uploaded/)).toBeVisible();
  await expect(sheet).toBeHidden();

  // The sheet keeps the last choice; switching back to public is what a user would do.
  await workerPage.getByRole('button', { name: 'Upload', exact: true }).first().click();
  sheet = workerPage.getByRole('dialog', { name: 'Upload files' });
  await sheet.getByRole('button', { name: 'Anyone with the link' }).click();
  await workerPage.locator('input[type="file"]').setInputFiles({ ...asPicked('', entry), name: publicTitle });
  await sheet.getByRole('button', { name: 'Upload 1 file' }).click();
  await expect(sheet).toBeHidden();

  await search(workerPage, prefix, 2);
  await expect(cardOf(workerPage, privateTitle).getByTitle('Private')).toBeVisible();
  await expect(cardOf(workerPage, publicTitle).getByTitle('Private')).toHaveCount(0);
  expect((await storedFile(db, bucket, privateTitle)).private).toBe(true);
  expect((await storedFile(db, bucket, publicTitle)).private).toBe(false);
});
