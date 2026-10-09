import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { test } from '../fixtures/test';
import { uniquePrefix, uploadOwnFiles } from '../utils/own-files';

// The screenshot beautifier (/beautify/<fileId>): wraps one of the user's own images in a background and frame and
// exports a PNG, by download or by saving it to the gallery. The app has no syntax highlighting for code files:
// it only takes images, and says so for anything else.

/** The bytes `/api/download?id=` saves, fetched as the browser does (the redirect target only resolves there). */
async function downloadedBytes(page: Page, id: string): Promise<Buffer> {
  const tab = await page.context().newPage();
  const download = tab.waitForEvent('download');
  // Navigating to an attachment is not a page load, so the goto itself is expected to fail.
  await tab.goto(`/api/download?id=${id}`).catch(() => undefined);
  const bytes = readFileSync((await (await download).path())!);
  await tab.close();
  return bytes;
}

test('a gallery image is beautified to a PNG of the chosen size, by download and by saving', async ({
  workerPage: page,
  workerRequest,
  corpus,
}) => {
  const [source] = await uploadOwnFiles(workerRequest, uniquePrefix('beautify'), [corpus.file('square-food.png')]);

  // The original stays downloadable, byte for byte.
  expect((await downloadedBytes(page, source!.id)).equals(readFileSync(source!.entry.path))).toBe(true);

  await page.goto(`/beautify/${source!.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Beautify', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: source!.title })).toBeVisible();
  await expect(page.getByText('1600 x 1200 PNG')).toBeVisible();

  // Typing is ignored until the page hydrates, so retry it (idempotent) until the size label follows.
  await expect(async () => {
    await page.getByLabel('Width', { exact: true }).fill('900');
    await page.getByLabel('Height', { exact: true }).fill('700');
    await page.getByLabel('Background color hex').fill('#ff0000');
    await expect(page.getByText('900 x 700 PNG')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`${source!.title.replace(/\.[^.]+$/, '')}-beautified.png`);

  const exported = readFileSync(await download.path());
  const meta = await sharp(exported).metadata();
  expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({ format: 'png', width: 900, height: 700 });
  // The corner is background, the middle is the photo.
  const { data } = await sharp(exported).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([data[0], data[1], data[2]]).toEqual([255, 0, 0]);

  await page.getByRole('button', { name: 'Save to gallery' }).click();
  await expect(page.getByText('Beautified image saved to your gallery.')).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View' }).click();
  await expect(page).toHaveURL(/\/view\/[^/]+$/);
  const savedId = new URL(page.url()).pathname.split('/').pop()!;
  const savedMeta = await sharp(await downloadedBytes(page, savedId)).metadata();
  expect({ format: savedMeta.format, width: savedMeta.width, height: savedMeta.height }).toEqual({
    format: 'png',
    width: 900,
    height: 700,
  });
});

test('a file that is not an image is refused', async ({ workerPage: page, workerRequest, corpus }) => {
  const [code] = await uploadOwnFiles(workerRequest, uniquePrefix('beautify-code'), [corpus.file('snippet.ts')]);

  await page.goto(`/beautify/${code!.id}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Image required' })).toBeVisible();
  await expect(page.getByText('The beautifier can only render image files from your gallery.')).toBeVisible();
});
