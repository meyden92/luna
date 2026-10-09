import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { serveFfmpegCore } from '../utils/ffmpeg';
import { decodeMedia } from '../utils/media';

// The video editor (/tools/video): ffmpeg.wasm runs in the page (its core comes from a CDN, so this needs the
// internet) and nothing is stored, so it runs as the read-only gallery user.

test('a trimmed clip exports as a playable MP4 that is shorter than the original', async ({ galleryPage: page, corpus }) => {
  test.setTimeout(180_000);
  const clip = corpus.file('clip.mp4');
  const original = await decodeMedia(page, readFileSync(clip.path), 'video/mp4');
  expect(original.duration).toBeCloseTo(3, 0);

  await serveFfmpegCore(page);
  await page.goto('/tools/video');
  await page.getByLabel('Drop a video here or click to browse').setInputFiles(clip.path);

  // Start 0.5 s in and End 1.0 s earlier: 3.0 s becomes 1.5 s. The steppers move in 0.1 s steps.
  await expect(page.getByText('Duration: 00:03.0')).toBeVisible();
  for (let step = 0; step < 5; step++) await page.getByRole('button', { name: 'Increase start' }).click();
  for (let step = 0; step < 10; step++) await page.getByRole('button', { name: 'Decrease end' }).click();
  await expect(page.getByText('Duration: 00:01.5')).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Export complete' })).toBeVisible({ timeout: 150_000 });

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('clip-edited.mp4');

  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
  const edited = await decodeMedia(page, bytes, 'video/mp4');
  expect(edited.duration).toBeCloseTo(1.5, 0);
  expect(edited.duration).toBeLessThan(original.duration - 1);
  expect({ width: edited.width, height: edited.height }).toEqual({ width: 320, height: 240 });
});
