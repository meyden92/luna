import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { fileCards } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import { cardOf, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';
import { previewCounter, previewOf } from '../utils/preview';

// Culling from the Preview: opening it while files are selected, and changing the selection from inside it.

const selectionBar = (page: Page) => page.getByRole('toolbar', { name: 'Selected files' });
const expectSelected = (page: Page, n: number) => expect(selectionBar(page).getByLabel(String(n), { exact: true })).toBeVisible();
const listedTitles = (page: Page) => fileCards(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''));

test('with files selected, a card’s Open preview opens the Preview and keeps the selection', async ({
  workerPage,
  workerRequest,
  corpus,
}) => {
  const prefix = uniquePrefix('pv-open-selecting');
  const [a, b, c] = await uploadOwnFiles(workerRequest, prefix, [
    corpus.file('notes.txt'),
    corpus.file('data.json'),
    corpus.file('readme.md'),
  ]);
  await openOwnFiles(workerPage, prefix, 3);
  for (const { title } of [a!, b!]) await cardOf(workerPage, title).getByRole('button', { name: 'Select', exact: true }).click();
  await expectSelected(workerPage, 2);

  await cardOf(workerPage, c!.title).hover();
  await cardOf(workerPage, c!.title).getByRole('button', { name: 'Open preview' }).click();

  const preview = previewOf(workerPage, c!.title);
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Select file' })).toHaveAttribute('aria-pressed', 'false');
  await expect(previewCounter(workerPage)).toHaveText(/· 2 selected$/);
});

test('the Preview selects with its button and X, and Escape closes it without dropping the selection', async ({
  workerPage,
  workerRequest,
  corpus,
}) => {
  const prefix = uniquePrefix('pv-select');
  await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt'), corpus.file('data.json'), corpus.file('readme.md')]);
  await openOwnFiles(workerPage, prefix, 3);
  const [first, second] = await listedTitles(workerPage);
  await clickUntil(cardOf(workerPage, first!), previewOf(workerPage, first!));

  await workerPage.keyboard.press('x');
  const firstPreview = previewOf(workerPage, first!);
  await expect(firstPreview.getByRole('button', { name: 'Select file' })).toHaveAttribute('aria-pressed', 'true');
  await expect(previewCounter(workerPage)).toHaveText(/· 1 selected$/);
  await expect(firstPreview.getByRole('button', { name: `View ${first}, selected` })).toBeVisible();

  await workerPage.keyboard.press('ArrowRight');
  const secondPreview = previewOf(workerPage, second!);
  await secondPreview.getByRole('button', { name: 'Select file' }).click();
  await expect(previewCounter(workerPage)).toHaveText(/· 2 selected$/);
  await workerPage.keyboard.press('x');
  await expect(secondPreview.getByRole('button', { name: 'Select file' })).toHaveAttribute('aria-pressed', 'false');
  await expect(previewCounter(workerPage)).toHaveText(/· 1 selected$/);

  await workerPage.keyboard.press('Escape');
  await expect(secondPreview).toBeHidden();
  await expectSelected(workerPage, 1);
  await expect(cardOf(workerPage, first!)).toHaveAttribute('aria-pressed', 'true');
  await expect(cardOf(workerPage, second!)).toHaveAttribute('aria-pressed', 'false');
});
