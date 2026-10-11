import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { cardTitles, fileCards } from '../utils/files-screen';

const PAGE_SIZE = 30;

test('scrolling loads pages of 30 until every file is shown once, then stops', async ({ galleryPage, gallery }) => {
  const total = gallery.files.length;
  const serverFnCalls: string[] = [];
  galleryPage.on('request', (request) => {
    if (request.url().includes('/_serverFn/')) serverFnCalls.push(request.url());
  });

  await galleryPage.goto('/dashboard');
  const cards = fileCards(galleryPage);
  await expect(cards).toHaveCount(PAGE_SIZE);

  // Every count the list passes through is a whole page, until the last short one.
  const seen = new Set<number>([PAGE_SIZE]);
  await expect(async () => {
    await cards.last().scrollIntoViewIfNeeded();
    seen.add(await cards.count());
    await expect(cards).toHaveCount(total, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  for (const count of seen) expect(count === total || count % PAGE_SIZE === 0).toBe(true);

  const titles = await cardTitles(galleryPage);
  expect(new Set(titles).size).toBe(total);
  expect([...titles].sort()).toEqual(gallery.files.map((f) => f.title).sort());

  // At the end the loader is gone: scrolling again fetches nothing and adds nothing.
  const callsBefore = serverFnCalls.length;
  await cards.last().scrollIntoViewIfNeeded();
  await galleryPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(serverFnCalls.length).toBe(callsBefore);
  await expect(cards).toHaveCount(total);
});
