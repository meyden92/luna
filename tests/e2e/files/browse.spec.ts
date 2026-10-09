import { expect, type Page } from '@playwright/test';
import { asc, desc, eq, type SQL } from 'drizzle-orm';
import { user } from '../../../src/db/schema/auth';
import { file } from '../../../src/db/schema/files';
import type { TestDb } from '../fixtures/db';
import { GALLERY_FOLDERS, type GalleryDataset, type GalleryFile, matchesSearch } from '../fixtures/gallery';
import { test } from '../fixtures/test';
import { fixtureUser } from '../fixtures/users';
import { asListed, cardTitles, countLine, fileCards, fileCount, loadAll, scopeRow } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';

// The Files screen shows the gallery user's dataset (fixtures/gallery.ts) in the right
// order and scope. The dataset is read-only: nothing here changes it.

const PAGE_SIZE = 30;
const sorted = (titles: readonly string[]) => [...titles].sort();

/** Opens the Files screen and waits until its first page of cards has rendered. */
async function openFiles(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(fileCards(page).first()).toBeVisible();
}

/** Switches Scope and waits for the page title to name it. */
async function openScope(page: Page, name: string): Promise<void> {
  await clickUntil(scopeRow(page, name), page.getByRole('heading', { level: 1, name }));
}

async function chooseType(page: Page, name: 'Images' | 'Video' | 'Audio' | 'Documents'): Promise<void> {
  const button = page.getByRole('group', { name: 'File type' }).getByRole('button', { name, exact: true });
  await clickUntil(button, page.getByRole('group', { name: 'File type' }).getByRole('button', { name, exact: true, pressed: true }));
}

/** Switches the sort and waits until the list shows the first expected title. */
async function sortBy(page: Page, label: 'Oldest first' | 'Name A–Z' | 'Largest first', firstTitle: string): Promise<void> {
  await clickUntil(page.getByRole('combobox', { name: 'Sort files' }), page.getByRole('option', { name: label }));
  await page.getByRole('option', { name: label }).click();
  await expect.poll(async () => (await cardTitles(page))[0]).toBe(firstTitle);
}

const inFolder = (files: readonly GalleryFile[], folder: string | null) => files.filter((f) => f.folder === folder);

test.describe('Scopes', () => {
  test('All files lists every seeded file with the header count', async ({ galleryPage, gallery }) => {
    await openFiles(galleryPage);

    await expect(galleryPage.getByRole('heading', { level: 1, name: 'All files' })).toBeVisible();
    await expect(countLine(galleryPage)).toHaveText(fileCount(gallery.files.length));
    await expect(scopeRow(galleryPage, 'All files')).toHaveAccessibleName(`All files ${gallery.files.length}`);
    await loadAll(galleryPage, gallery.files.length);
    expect(sorted(await cardTitles(galleryPage))).toEqual(sorted(gallery.files.map((f) => f.title)));
  });

  test('Not in a folder lists only unfiled files', async ({ galleryPage, gallery }) => {
    const expected = inFolder(gallery.files, null);
    await openFiles(galleryPage);

    await openScope(galleryPage, 'Not in a folder');

    await expect(countLine(galleryPage)).toHaveText(fileCount(expected.length));
    await expect(scopeRow(galleryPage, 'Not in a folder')).toHaveAccessibleName(`Not in a folder ${expected.length}`);
    await loadAll(galleryPage, expected.length);
    expect(sorted(await cardTitles(galleryPage))).toEqual(sorted(expected.map((f) => f.title)));
  });

  for (const folder of GALLERY_FOLDERS) {
    test(`the ${folder} folder lists only its files`, async ({ galleryPage, gallery }) => {
      const expected = inFolder(gallery.files, folder);
      await openFiles(galleryPage);

      await openScope(galleryPage, folder);

      await expect(countLine(galleryPage)).toHaveText(fileCount(expected.length));
      await expect(scopeRow(galleryPage, folder)).toHaveAccessibleName(`${folder} ${expected.length}`);
      await loadAll(galleryPage, expected.length);
      expect(sorted(await cardTitles(galleryPage))).toEqual(sorted(expected.map((f) => f.title)));
    });
  }

  test('switching Scope clears the selection', async ({ galleryPage }) => {
    await openFiles(galleryPage);
    const selection = galleryPage.getByLabel('Selected files');

    await clickUntil(fileCards(galleryPage).first().getByRole('button', { name: 'Select' }), selection);
    await openScope(galleryPage, 'Not in a folder');

    await expect(selection).toBeHidden();
  });
});

test.describe('Type filter', () => {
  const types = [
    { button: 'Images', kind: 'image' },
    { button: 'Video', kind: 'video' },
    { button: 'Audio', kind: 'audio' },
    // "Documents" is every file that is not an image, video or audio.
    { button: 'Documents', kind: 'file' },
  ] as const;

  for (const { button, kind } of types) {
    test(`${button} lists only the ${kind === 'file' ? 'non-media' : kind} files`, async ({ galleryPage, gallery }) => {
      const expected = gallery.files.filter((f) => f.source.kind === kind);
      expect(expected.length).toBeGreaterThan(0);
      await openFiles(galleryPage);

      await chooseType(galleryPage, button);

      await expect(countLine(galleryPage)).toHaveText(fileCount(expected.length));
      await loadAll(galleryPage, expected.length);
      expect(sorted(await cardTitles(galleryPage))).toEqual(sorted(expected.map((f) => f.title)));
    });
  }

  test('All brings back every file', async ({ galleryPage, gallery }) => {
    await openFiles(galleryPage);
    await chooseType(galleryPage, 'Audio');

    await clickUntil(
      galleryPage.getByRole('group', { name: 'File type' }).getByRole('button', { name: 'All', exact: true }),
      galleryPage.getByText(fileCount(gallery.files.length), { exact: true }),
    );
  });
});

/**
 * Waits until the loaded cards are the first pages of `expected`, in the order
 * the page lists them (regrouped by date heading, see `asListed`). However many
 * pages have loaded by then, the list must be a whole prefix of the sort.
 */
async function expectListed(page: Page, expected: readonly GalleryFile[]): Promise<void> {
  await expect
    .poll(async () => {
      const titles = await cardTitles(page);
      const wanted = asListed(expected.slice(0, titles.length), (f) => f.group);
      const wholePages = titles.length % PAGE_SIZE === 0 || titles.length === expected.length;
      return titles.length > 0 && wholePages && titles.join('\n') === wanted.join('\n')
        ? 'listed'
        : `${titles.length} cards, expected ${wanted.length}:\n${titles.join('\n')}\n--\n${wanted.join('\n')}`;
    })
    .toBe('listed');
}

/** The gallery user's files in the order Postgres sorts them by `column`, via their dataset entries. */
async function datasetOrderedBy(db: TestDb, gallery: GalleryDataset, order: SQL[]): Promise<GalleryFile[]> {
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, fixtureUser('gallery').username));
  const rows = await db
    .select({ title: file.title })
    .from(file)
    .where(eq(file.ownerId, owner!.id))
    .orderBy(...order);
  const byTitle = new Map(gallery.files.map((f) => [f.title, f]));
  const ordered = rows.map((row) => byTitle.get(row.title!)!);
  expect(ordered).toHaveLength(gallery.files.length);
  return ordered;
}

test.describe('Sorts', () => {
  test('Newest first and Oldest first order by creation date across page boundaries', async ({ galleryPage, gallery }) => {
    const newest = [...gallery.files].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    await openFiles(galleryPage);

    await expectListed(galleryPage, newest);
    await loadAll(galleryPage, newest.length);
    await expectListed(galleryPage, newest);

    const oldest = [...newest].reverse();
    await sortBy(galleryPage, 'Oldest first', oldest[0]!.title);
    await expectListed(galleryPage, oldest);
    await loadAll(galleryPage, oldest.length);
    await expectListed(galleryPage, oldest);
  });

  test('Name A–Z orders by title across page boundaries', async ({ galleryPage, gallery, db }) => {
    // The order is Postgres's collation of `title` (spaces, parentheses and Unicode
    // included), so the database is asked for it instead of re-deriving it in JS.
    const expected = await datasetOrderedBy(db, gallery, [asc(file.title), asc(file.id)]);

    await openFiles(galleryPage);
    await sortBy(galleryPage, 'Name A–Z', expected[0]!.title);

    await expectListed(galleryPage, expected);
    await loadAll(galleryPage, expected.length);
    await expectListed(galleryPage, expected);
  });

  test('Largest first orders by size across page boundaries', async ({ galleryPage, gallery, db }) => {
    // Copies of one file share a size and tie-break on a random id, so the ids come
    // from the database; sizes still come from the dataset and must never increase.
    const expected = await datasetOrderedBy(db, gallery, [desc(file.size), desc(file.id)]);
    const sizes = expected.map((f) => f.source.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));

    await openFiles(galleryPage);
    await sortBy(galleryPage, 'Largest first', expected[0]!.title);

    await expectListed(galleryPage, expected);
    await loadAll(galleryPage, expected.length);
    await expectListed(galleryPage, expected);
  });
});

test.describe('Search', () => {
  const search = (page: Page) => page.getByLabel('Search files by name');

  test('matches titles case-insensitively and states the count', async ({ galleryPage, gallery }) => {
    const term = 'PDF';
    const expected = gallery.files.filter((f) => matchesSearch(f, term));
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(gallery.files.length);
    await openFiles(galleryPage);

    await search(galleryPage).fill(term);

    await expect(countLine(galleryPage)).toHaveText(`${fileCount(expected.length)} matching “${term}”`);
    await loadAll(galleryPage, expected.length);
    expect(sorted(await cardTitles(galleryPage))).toEqual(sorted(expected.map((f) => f.title)));
    // The match is on a lower-case title, so the term's case did not matter.
    expect(expected.every((f) => f.title.includes('pdf'))).toBe(true);
  });

  test('matches tags as well as titles', async ({ galleryPage, gallery }) => {
    // Every ShareX upload is tagged "sharex-upload"; no title contains it.
    const term = 'sharex-up';
    expect(gallery.files.some((f) => f.title.toLowerCase().includes(term))).toBe(false);
    await openFiles(galleryPage);

    await search(galleryPage).fill(term.toUpperCase());

    await expect(countLine(galleryPage)).toHaveText(`${fileCount(gallery.files.length)} matching “${term.toUpperCase()}”`);
  });

  test('combines with Scope and type', async ({ galleryPage, gallery }) => {
    const term = 'png';
    const expected = gallery.files.filter((f) => f.folder === 'Travel' && f.source.kind === 'image' && matchesSearch(f, term));
    expect(expected.length).toBeGreaterThan(0);
    await openFiles(galleryPage);

    await openScope(galleryPage, 'Travel');
    await chooseType(galleryPage, 'Images');
    await search(galleryPage).fill(term);

    await expect(countLine(galleryPage)).toHaveText(`${fileCount(expected.length)} matching “${term}”`);
    await loadAll(galleryPage, expected.length);
    expect(sorted(await cardTitles(galleryPage))).toEqual(sorted(expected.map((f) => f.title)));
  });
});

test.describe('Empty states', () => {
  test('a search with no hits says so and Clear filters restores the list', async ({ galleryPage, gallery }) => {
    await openFiles(galleryPage);

    await galleryPage.getByLabel('Search files by name').fill('zzz-no-such-file');

    await expect(galleryPage.getByText('No files match')).toBeVisible();
    await expect(galleryPage.getByText('Try a different name or file type.')).toBeVisible();
    await expect(countLine(galleryPage)).toHaveText('0 files matching “zzz-no-such-file”');

    await galleryPage.getByRole('button', { name: 'Clear filters' }).click();

    await expect(galleryPage.getByText('No files match')).toBeHidden();
    await expect(galleryPage.getByLabel('Search files by name')).toHaveValue('');
    await expect(countLine(galleryPage)).toHaveText(fileCount(gallery.files.length));
    await expect(fileCards(galleryPage).first()).toBeVisible();
  });

  test('the empty user sees an empty folder and Upload opens the upload sheet', async ({ emptyPage }) => {
    await emptyPage.goto('/dashboard');

    await expect(emptyPage.getByText('This folder is empty')).toBeVisible();
    await expect(emptyPage.getByText('Drag files onto this folder in the sidebar, or upload new ones.')).toBeVisible();
    await expect(countLine(emptyPage)).toHaveText('0 files');

    await clickUntil(
      emptyPage.getByRole('main').getByRole('button', { name: 'Upload', exact: true }),
      emptyPage.getByRole('heading', { name: 'Upload files' }),
    );
  });
});
