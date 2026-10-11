import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { serveFfmpegCore } from '../utils/ffmpeg';
import { decodeMedia } from '../utils/media';

// The audio editor (/tools/audio): a clip is cut on the timeline and exported in the page (MP3 is encoded by
// ffmpeg.wasm, which needs the internet). Nothing is stored, so it runs as the read-only gallery user.

test('a clip cut to its first second exports as WAV and MP3 audio of that length', async ({ galleryPage: page, corpus }) => {
  const tone = corpus.file('tone.mp3');
  const original = await decodeMedia(page, readFileSync(tone.path), 'audio/mpeg');
  expect(original.duration).toBeCloseTo(3, 0);

  await serveFfmpegCore(page);
  await page.goto('/tools/audio');
  await page.getByLabel('Drop audio files here').setInputFiles(tone.path);
  const pooled = page.getByText('tone', { exact: true });
  await expect(pooled).toBeVisible();

  // A file only joins the pool; dragging it onto the track puts a clip on the timeline.
  const clip = page.getByRole('group', { name: /^Clip / });
  const from = (await pooled.boundingBox())!;
  const trackName = await page.getByRole('textbox', { name: 'Track name' }).first().inputValue();
  const to = (await page.getByRole('group', { name: trackName, exact: true }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(clip).toHaveCount(1);

  // Clicking the clip selects it and puts the playhead there: one second in, given that the clip is as wide as it
  // is long. Splitting there and deleting the second half leaves one second.
  const box = (await clip.boundingBox())!;
  const pixelsPerSecond = box.width / original.duration;
  await clip.click({ position: { x: pixelsPerSecond, y: box.height / 2 } });
  await page.getByRole('button', { name: 'Split at Playhead' }).click();
  await expect(clip).toHaveCount(2);
  await clip.last().click({ position: { x: 20, y: box.height / 2 } });
  await page.getByRole('button', { name: 'Delete Clip' }).click();
  await expect(clip).toHaveCount(1);

  for (const format of [
    { option: 'WAV (lossless)', ext: 'wav', mime: 'audio/wav', starts: (b: Buffer) => b.subarray(0, 4).toString('latin1') === 'RIFF' },
    {
      option: 'MP3 (compressed)',
      ext: 'mp3',
      mime: 'audio/mpeg',
      starts: (b: Buffer) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0),
    },
  ]) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export Audio' });
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: format.option }).click();

    const downloading = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format.ext}$`));

    const bytes = readFileSync(await download.path());
    expect(format.starts(bytes), `${format.ext} starts with its container's signature`).toBe(true);
    const exported = await decodeMedia(page, bytes, format.mime);
    expect(exported.duration).toBeGreaterThan(0.8);
    expect(exported.duration).toBeLessThan(1.3);
    await expect(dialog).toBeHidden();
  }
});
