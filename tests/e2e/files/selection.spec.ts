import { expect, type Page } from '@playwright/test';
import { inArray } from 'drizzle-orm';
import { file } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { fileCards } from '../utils/files-screen';
import { cardOf, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';

// Selecting files on the Files screen: one by one, a whole date group, and clearing.
// The SelectionBar's own actions are in bulk-actions.spec.ts.

const selectionBar = (page: Page) => page.getByRole('toolbar', { name: 'Selected files' });

/** The bar's "N selected" reads as a number only in the accessible name of the count. */
const expectSelected = (page: Page, n: number) => expect(selectionBar(page).getByLabel(String(n), { exact: true })).toBeVisible();

const checkOf = (page: Page, title: string, name: 'Select' | 'Deselect') => cardOf(page, title).getByRole('button', { name, exact: true });

test('checking cards one by one selects them and the bar counts them', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('select-single');
  const [a, b, c] = await uploadOwnFiles(workerRequest, prefix, [
    corpus.file('notes.txt'),
    corpus.file('data.json'),
    corpus.file('readme.md'),
  ]);
  await openOwnFiles(workerPage, prefix, 3);
  await expect(selectionBar(workerPage)).toBeHidden();

  await checkOf(workerPage, a!.title, 'Select').click();
  await expectSelected(workerPage, 1);
  await expect(cardOf(workerPage, a!.title)).toHaveAttribute('aria-pressed', 'true');

  await checkOf(workerPage, b!.title, 'Select').click();
  await expectSelected(workerPage, 2);

  // The check toggles: deselecting one leaves the other.
  await checkOf(workerPage, a!.title, 'Deselect').click();
  await expectSelected(workerPage, 1);
  await expect(cardOf(workerPage, a!.title)).toHaveAttribute('aria-pressed', 'false');
  await expect(cardOf(workerPage, b!.title)).toHaveAttribute('aria-pressed', 'true');
  await expect(cardOf(workerPage, c!.title)).toHaveAttribute('aria-pressed', 'false');

  // While something is selected, a click on a card extends the selection.
  await cardOf(workerPage, c!.title).click();
  await expectSelected(workerPage, 2);
  await expect(cardOf(workerPage, c!.title)).toHaveAttribute('aria-pressed', 'true');
});

test('Escape clears the selection', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('select-escape');
  const files = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt'), corpus.file('data.json')]);
  await openOwnFiles(workerPage, prefix, 2);
  for (const { title } of files) await checkOf(workerPage, title, 'Select').click();
  await expectSelected(workerPage, 2);

  await workerPage.keyboard.press('Escape');

  await expect(selectionBar(workerPage)).toBeHidden();
  for (const { title } of files) await expect(cardOf(workerPage, title)).toHaveAttribute('aria-pressed', 'false');
});

test('the bar’s Clear selection button clears the selection', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('select-clear');
  const [a] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await openOwnFiles(workerPage, prefix, 1);
  await checkOf(workerPage, a!.title, 'Select').click();
  await expectSelected(workerPage, 1);

  await selectionBar(workerPage).getByRole('button', { name: 'Clear selection' }).click();

  await expect(selectionBar(workerPage)).toBeHidden();
  await expect(cardOf(workerPage, a!.title)).toHaveAttribute('aria-pressed', 'false');
});

test('a date group selects all of its files and only those', async ({ workerPage, workerRequest, db, corpus }) => {
  const prefix = uniquePrefix('select-group');
  const [old1, old2, recent] = await uploadOwnFiles(workerRequest, prefix, [
    corpus.file('notes.txt'),
    corpus.file('data.json'),
    corpus.file('readme.md'),
  ]);
  // Two files go back to a month nobody else uses, so they form a group of their own.
  await db
    .update(file)
    .set({ createdAt: new Date('2019-03-15T12:00:00Z') })
    .where(inArray(file.id, [old1!.id, old2!.id]));
  await openOwnFiles(workerPage, prefix, 3);
  const march = workerPage.locator('section', { has: workerPage.getByRole('heading', { name: 'March 2019' }) });
  await expect(march.locator('article[role="button"]')).toHaveCount(2);

  await march.getByRole('button', { name: 'Select all' }).click();

  await expectSelected(workerPage, 2);
  await expect(cardOf(workerPage, old1!.title)).toHaveAttribute('aria-pressed', 'true');
  await expect(cardOf(workerPage, old2!.title)).toHaveAttribute('aria-pressed', 'true');
  await expect(cardOf(workerPage, recent!.title)).toHaveAttribute('aria-pressed', 'false');

  // The same control now deselects the group.
  await march.locator('header').getByRole('button', { name: 'Deselect' }).click();
  await expect(selectionBar(workerPage)).toBeHidden();
  await expect(fileCards(workerPage).and(workerPage.locator('[aria-pressed="true"]'))).toHaveCount(0);
});
