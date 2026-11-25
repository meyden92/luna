import { expect, type Page, type Route } from '@playwright/test';
import { test } from '../fixtures/test';
import { fileCards, loadAll } from '../utils/files-screen';
import { cardOf, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';

// What a gallery change costs once many cards are loaded, and how a delete behaves before and after the server answers.

const selectionBar = (page: Page) => page.getByRole('toolbar', { name: 'Selected files' });

/** Holds the delete call for `fileId` until the returned function settles it. */
async function holdDelete(page: Page, fileId: string): Promise<(settle: (route: Route) => Promise<void>) => Promise<void>> {
  let held: (route: Route) => void;
  const arrived = new Promise<Route>((resolve) => {
    held = resolve;
  });
  await page.route('**/_serverFn/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.postData()?.includes(fileId)) held(route);
    else await route.continue();
  });
  return async (settle) => settle(await arrived);
}

async function confirmBulkDelete(page: Page, count: number): Promise<void> {
  await selectionBar(page).getByRole('button', { name: 'Delete' }).click();
  await page
    .getByRole('alertdialog', { name: `Delete ${count} files?` })
    .getByRole('button', { name: 'Delete' })
    .click();
}

test('a layout change animates only the cards on screen, however many are loaded', async ({ galleryPage, gallery }) => {
  const total = gallery.files.length;
  await galleryPage.goto('/dashboard');
  await loadAll(galleryPage, total);

  // Collects every card group the transition animates, and how many cards were on screen before and after it.
  const watched = galleryPage.evaluate(
    () =>
      new Promise<{ animated: number; onScreen: number }>((resolve) => {
        const onScreenCards = () =>
          [...document.querySelectorAll('article[role="button"]')].filter((card) => {
            const box = card.getBoundingClientRect();
            return box.bottom > 0 && box.top < window.innerHeight;
          }).length;
        const before = onScreenCards();
        const animated = new Set<string>();
        const started = performance.now();
        const sample = () => {
          for (const animation of document.getAnimations()) {
            const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement ?? '';
            if (pseudo.startsWith('::view-transition-group(c-')) animated.add(pseudo);
          }
          if (performance.now() - started < 1_500) requestAnimationFrame(sample);
          else resolve({ animated: animated.size, onScreen: before + onScreenCards() });
        };
        requestAnimationFrame(sample);
      }),
  );
  await galleryPage.getByRole('button', { name: 'View options' }).click();
  await galleryPage.getByRole('button', { name: 'Grid' }).click();

  const { animated, onScreen } = await watched;
  expect(onScreen).toBeLessThan(total);
  expect(animated).toBeGreaterThan(0);
  expect(animated).toBeLessThanOrEqual(onScreen);
});

test('a delete takes the cards off before the server answers', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('delete-early');
  const [a, b, kept] = await uploadOwnFiles(workerRequest, prefix, [
    corpus.file('notes.txt'),
    corpus.file('data.json'),
    corpus.file('readme.md'),
  ]);
  await openOwnFiles(workerPage, prefix, 3);
  const settleDelete = await holdDelete(workerPage, a!.id);

  for (const { title } of [a!, b!]) await cardOf(workerPage, title).getByRole('button', { name: 'Select', exact: true }).click();
  await confirmBulkDelete(workerPage, 2);

  await expect(fileCards(workerPage)).toHaveCount(1);
  await expect(cardOf(workerPage, kept!.title)).toBeVisible();
  await expect(selectionBar(workerPage)).toBeHidden();

  await settleDelete((route) => route.continue());
  await expect(workerPage.getByText('2 files deleted')).toBeVisible();
});

test('a delete the server refuses brings the files back, still selected', async ({ workerPage, workerRequest, corpus }) => {
  const prefix = uniquePrefix('delete-refused');
  const files = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt'), corpus.file('data.json')]);
  await openOwnFiles(workerPage, prefix, 2);
  const settleDelete = await holdDelete(workerPage, files[0]!.id);

  for (const { title } of files) await cardOf(workerPage, title).getByRole('button', { name: 'Select', exact: true }).click();
  await confirmBulkDelete(workerPage, 2);
  await expect(fileCards(workerPage)).toHaveCount(0);

  await settleDelete((route) => route.abort('failed'));
  await expect(workerPage.locator('[data-sonner-toast][data-type="error"]')).toBeVisible();
  await expect(fileCards(workerPage)).toHaveCount(2);
  await expect(selectionBar(workerPage).getByLabel('2', { exact: true })).toBeVisible();

  // Nothing was deleted on the server.
  await openOwnFiles(workerPage, prefix, 2);
});
