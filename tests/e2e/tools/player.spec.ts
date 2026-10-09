import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

// The music player (/player): lists the signed-in user's audio files and plays them. Read only, so it runs as the
// gallery user. Video is not in the player (it lists audio content types only); video playback is asserted on the
// public file page in serving/view.spec.ts.

test('a track from the gallery plays: its clock advances and the stream has no error', async ({ galleryPage: page, gallery }) => {
  const tracks = gallery.files.filter((file) => file.source.kind === 'audio').map((file) => file.title);
  expect(tracks.length).toBeGreaterThan(1);
  await page.goto('/player');
  for (const title of tracks) await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();

  const audio = page.locator('audio');
  // The first listed track is loaded; choosing another switches the stream to that file.
  const chosen = tracks[1]!;
  await page.getByRole('button', { name: chosen, exact: true }).click();
  await expect(page.getByRole('button', { name: chosen, exact: true })).toHaveAttribute('aria-current', 'true');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.3);
  const { error, duration } = await audio.evaluate((element: HTMLAudioElement) => ({
    error: element.error?.code ?? null,
    duration: element.duration,
  }));
  expect(error).toBeNull();
  expect(duration).toBeGreaterThan(1);
  await expect(page.getByLabel('Now playing')).toBeVisible();

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});
