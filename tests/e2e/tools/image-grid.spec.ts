import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import sharp from 'sharp';
import { test } from '../fixtures/test';

// The image grid tool (/image-grid): local images composed on a canvas and downloaded as a PNG. Nothing is
// stored, so it runs as the read-only gallery user.

test('three images are composed into a downloaded PNG with the configured layout', async ({ galleryPage: page, corpus }) => {
  const images = ['landscape-photo.jpg', 'portrait-tall.webp', 'robot-illustration.png'].map((name) => corpus.file(name).path);
  await page.goto('/image-grid');
  await expect(page.getByText('Select images to see grid layout')).toBeVisible();

  await page.getByLabel('Click to upload images').setInputFiles(images);
  await expect(page.getByText('Select Images (3)')).toBeVisible();

  // Fixed canvas, a manual 3 x 1 layout of 200 x 150 cells with 10 px gaps: 3 * 200 + 2 * 10 by 150.
  // The images showing means the page is hydrated, so these toggles can be clicked once each. The first three
  // are named by their current mode, in turn: canvas size, grid layout, cell size.
  await page.getByRole('button', { name: 'Auto-fit', exact: true }).click();
  await page.getByRole('button', { name: 'Auto', exact: true }).first().click();
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await page.getByLabel('Columns').fill('3');
  await page.getByLabel('Rows').fill('1');
  await page.getByLabel('Spacing (px)').fill('10');
  await page.getByLabel('Cell Width (px)').fill('200');
  await page.getByLabel('Cell Height (px)').fill('150');
  await page.getByLabel('Cell Height (px)').press('Enter');

  await expect(page.getByText('Final size: 620 × 150 pixels')).toBeVisible();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('image-grid-620x150.png');

  const bytes = readFileSync(await download.path());
  const meta = await sharp(bytes).metadata();
  expect(meta.format).toBe('png');
  expect({ width: meta.width, height: meta.height }).toEqual({ width: 620, height: 150 });

  // Each cell holds its photo: no cell is the flat background colour, and the first and last cells differ.
  const cell = async (index: number) =>
    sharp(
      await sharp(bytes)
        .extract({ left: index * 210, top: 0, width: 200, height: 150 })
        .toBuffer(),
    ).stats();
  const [first, last] = [await cell(0), await cell(2)];
  for (const stats of [first, last, await cell(1)]) {
    expect(stats.channels.some((channel) => channel.stdev > 5)).toBe(true);
  }
  expect(first.channels.map((channel) => Math.round(channel.mean))).not.toEqual(last.channels.map((channel) => Math.round(channel.mean)));
});
