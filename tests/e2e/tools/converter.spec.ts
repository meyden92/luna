import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { serveFfmpegCore } from '../utils/ffmpeg';
import { decodeMedia, recordClipWithSound } from '../utils/media';

// The video-to-audio converter (/tools/converter): ffmpeg.wasm runs in the page (its core comes from a CDN, so this
// needs the internet) and nothing is stored, so it runs as the read-only gallery user.

/** Each offered output format: the option's label, the file extension, the container's MIME type and its first bytes. */
const FORMATS = [
  {
    label: 'MP3',
    ext: 'mp3',
    mime: 'audio/mpeg',
    starts: (b: Buffer) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0),
  },
  {
    label: 'WAV',
    ext: 'wav',
    mime: 'audio/wav',
    starts: (b: Buffer) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE',
  },
  { label: 'OGG', ext: 'ogg', mime: 'audio/ogg', starts: (b: Buffer) => b.subarray(0, 4).toString('latin1') === 'OggS' },
  { label: 'FLAC', ext: 'flac', mime: 'audio/flac', starts: (b: Buffer) => b.subarray(0, 4).toString('latin1') === 'fLaC' },
  // AAC comes in an MP4 container, hence m4a.
  { label: 'AAC', ext: 'm4a', mime: 'audio/mp4', starts: (b: Buffer) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
] as const;

const chooseFormat = async (page: Page, label: string) => {
  await page.getByLabel('Output Format').click();
  await page.getByRole('option', { name: label, exact: true }).click();
};

test('a video with sound converts to every offered audio format, in the right container', async ({ galleryPage: page }) => {
  test.setTimeout(240_000);
  await serveFfmpegCore(page);
  await page.goto('/tools/converter');
  const seconds = 2;
  const video = await recordClipWithSound(page, seconds);

  await page
    .getByLabel('Drop video files here or click to browse')
    .setInputFiles({ name: 'tone-clip.mp4', mimeType: 'video/mp4', buffer: video });
  for (const format of FORMATS) {
    await chooseFormat(page, format.label);
    await page.getByRole('button', { name: 'Convert to Audio' }).click();
    await expect(page.getByText('Conversion Complete!', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(`(${format.label})`)).toBeVisible();

    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Audio File' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`tone-clip-converted.${format.ext}`);

    const bytes = readFileSync(await download.path());
    expect(format.starts(bytes), `${format.label} starts with its container's signature`).toBe(true);
    // The browser can play it, and it is as long as the video was.
    expect((await decodeMedia(page, bytes, format.mime)).duration).toBeCloseTo(seconds, 0);

    await page.getByRole('button', { name: 'Convert Another File' }).click();
    await page
      .getByLabel('Drop video files here or click to browse')
      .setInputFiles({ name: 'tone-clip.mp4', mimeType: 'video/mp4', buffer: video });
  }
});

test('a video without an audio track is refused', async ({ galleryPage: page, corpus }) => {
  test.setTimeout(180_000);
  await serveFfmpegCore(page);
  await page.goto('/tools/converter');
  await page.getByLabel('Drop video files here or click to browse').setInputFiles(corpus.file('clip.mp4').path);
  await page.getByRole('button', { name: 'Convert to Audio' }).click();
  await expect(page.getByText('This video has no audio track.')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('button', { name: 'Download Audio File' })).toHaveCount(0);
});
