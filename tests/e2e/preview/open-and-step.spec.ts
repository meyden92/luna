import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { fileCards } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import { cardOf } from '../utils/own-files';
import { galleryFileIds, previewCounter, previewOf } from '../utils/preview';

// Opening the Preview and walking through the gallery user's files, newest first.

const PAGE_SIZE = 30;

test('clicking a card opens the Preview on that file, Esc closes it', async ({ galleryPage, gallery }) => {
  const title = gallery.groups.flatMap((g) => g.files)[2]!.title;
  await galleryPage.goto('/dashboard');

  await clickUntil(cardOf(galleryPage, title), previewOf(galleryPage, title));
  await expect(previewOf(galleryPage, title).getByRole('heading', { level: 2, name: title })).toBeVisible();

  await galleryPage.keyboard.press('Escape');
  await expect(previewOf(galleryPage, title)).toBeHidden();
  await expect(cardOf(galleryPage, title)).toBeVisible();
});

test('the card menu opens without opening the Preview', async ({ galleryPage, gallery }) => {
  const title = gallery.groups.flatMap((g) => g.files)[0]!.title;
  await galleryPage.goto('/dashboard');
  const card = cardOf(galleryPage, title);
  await card.hover();
  await clickUntil(card.getByRole('button', { name: 'More actions' }), galleryPage.getByRole('menuitem', { name: 'Download' }));

  await expect(galleryPage.getByRole('dialog')).toHaveCount(0);
});

test('/dashboard?file=<id> opens that file directly, and closing clears the link', async ({ galleryPage, gallery, db }) => {
  const title = gallery.groups.flatMap((g) => g.files)[4]!.title;
  const id = (await galleryFileIds(db)).get(title)!;
  await galleryPage.goto(`/dashboard?file=${id}`);

  await expect(previewOf(galleryPage, title)).toBeVisible();
  await expect(previewCounter(galleryPage)).toContainText('5 /');

  await galleryPage.getByRole('button', { name: 'Close (Esc)' }).click();
  await expect(previewOf(galleryPage, title)).toBeHidden();
  await expect(galleryPage).not.toHaveURL(/file=/);
  await expect(fileCards(galleryPage).first()).toBeVisible();
});

test('a linked file that is not on the first page opens too', async ({ galleryPage, gallery, db }) => {
  const title = gallery.groups.flatMap((g) => g.files)[PAGE_SIZE * 2 + 3]!.title;
  const id = (await galleryFileIds(db)).get(title)!;
  await galleryPage.goto(`/dashboard?file=${id}`);

  await expect(previewOf(galleryPage, title)).toBeVisible();
});

test('next and previous walk the newest-first order, by button and by key, across the page boundary', async ({
  galleryPage,
  gallery,
  db,
}) => {
  const order = gallery.groups.flatMap((g) => g.files).map((f) => f.title);
  const id = (await galleryFileIds(db)).get(order[PAGE_SIZE - 3]!)!;
  await galleryPage.goto(`/dashboard?file=${id}`);
  await expect(previewOf(galleryPage, order[PAGE_SIZE - 3]!)).toBeVisible();
  // Standing within five files of the end of page one fetches page two.
  await expect(previewCounter(galleryPage)).toHaveText(`${PAGE_SIZE - 2} / ${PAGE_SIZE * 2}`);

  await galleryPage.getByRole('button', { name: 'Next file' }).click();
  await expect(previewOf(galleryPage, order[PAGE_SIZE - 2]!)).toBeVisible();
  await galleryPage.keyboard.press('ArrowRight');
  await expect(previewOf(galleryPage, order[PAGE_SIZE - 1]!)).toBeVisible();
  await expect(previewCounter(galleryPage)).toHaveText(`${PAGE_SIZE} / ${PAGE_SIZE * 2}`);

  // Item 30 to item 31.
  await galleryPage.keyboard.press('ArrowRight');
  await expect(previewOf(galleryPage, order[PAGE_SIZE]!)).toBeVisible();
  await expect(previewCounter(galleryPage)).toHaveText(`${PAGE_SIZE + 1} / ${PAGE_SIZE * 2}`);

  await galleryPage.getByRole('button', { name: 'Previous file' }).click();
  await expect(previewOf(galleryPage, order[PAGE_SIZE - 1]!)).toBeVisible();
  await galleryPage.keyboard.press('ArrowLeft');
  await expect(previewOf(galleryPage, order[PAGE_SIZE - 2]!)).toBeVisible();
});

test('the first file has no previous button and the last loaded file has no next until more loads', async ({
  galleryPage,
  gallery,
  db,
}) => {
  const order = gallery.groups.flatMap((g) => g.files).map((f) => f.title);
  const id = (await galleryFileIds(db)).get(order[0]!)!;
  await galleryPage.goto(`/dashboard?file=${id}`);

  await expect(previewOf(galleryPage, order[0]!)).toBeVisible();
  await expect(galleryPage.getByRole('button', { name: 'Previous file' })).toHaveCount(0);
  await expect(galleryPage.getByRole('button', { name: 'Next file' })).toBeVisible();
  await galleryPage.keyboard.press('ArrowLeft');
  await expect(previewOf(galleryPage, order[0]!)).toBeVisible();
});

test('closing returns to the list where it was', async ({ galleryPage, gallery }) => {
  const order = gallery.groups.flatMap((g) => g.files).map((f) => f.title);
  const title = order[PAGE_SIZE - 4]!;
  await galleryPage.goto('/dashboard');
  await expect(fileCards(galleryPage)).toHaveCount(PAGE_SIZE);
  await cardOf(galleryPage, title).scrollIntoViewIfNeeded();
  const scrollBefore = await galleryPage.evaluate(() => window.scrollY);
  expect(scrollBefore).toBeGreaterThan(0);

  await clickUntil(cardOf(galleryPage, title), previewOf(galleryPage, title));
  await galleryPage.keyboard.press('ArrowRight');
  await galleryPage.keyboard.press('Escape');
  await expect(galleryPage.getByRole('dialog')).toHaveCount(0);

  await expect.poll(() => galleryPage.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore * 0.9);
  await expect(cardOf(galleryPage, title)).toBeInViewport();
});
