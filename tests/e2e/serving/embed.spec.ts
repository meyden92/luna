import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { servedFile } from '../utils/served-files';

// `/embed/<id>`: the standalone player an iframe shows. No sign-in; public files only.
// Known gap, not asserted: RustFS ignores per-object ACLs, so a private object is readable at its raw bucket URL.

test('a public image embeds on its own', async ({ page, gallery, db }) => {
  const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
  const response = await page.goto(`/embed/${image.id}`);

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(image.title);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  const shown = page.getByRole('img', { name: 'Shared image', exact: true });
  await expect(shown).toHaveJSProperty('naturalWidth', image.entry.dimensions!.width);
  await expect(shown).toHaveJSProperty('naturalHeight', image.entry.dimensions!.height);
  // Standalone: none of the view page's chrome.
  await expect(page.getByRole('link', { name: 'Download original' })).toHaveCount(0);
});

test('a public video embeds with its player', async ({ page, gallery, db }) => {
  const video = await servedFile(gallery, db, 'clip.mp4', { private: false });
  await page.goto(`/embed/${video.id}`);

  const player = page.locator('video');
  await expect(player).toHaveJSProperty('videoWidth', video.entry.dimensions!.width);
  await expect(player).toHaveJSProperty('videoHeight', video.entry.dimensions!.height);
});

test('a public audio file embeds with its player', async ({ page, gallery, db }) => {
  const tone = await servedFile(gallery, db, 'tone.mp3', { private: false });
  await page.goto(`/embed/${tone.id}`);

  await expect.poll(() => page.locator('audio').evaluate((element: HTMLAudioElement) => element.duration)).toBeCloseTo(3, 0);
});

test('a public file without a viewer says so', async ({ page, gallery, db }) => {
  const pdf = await servedFile(gallery, db, 'document.pdf', { private: false });
  await page.goto(`/embed/${pdf.id}`);

  await expect(page.getByText('This file has no in-browser preview.')).toBeVisible();
  await expect(page.locator('video, audio, iframe, object, embed, img[alt="Shared image"]')).toHaveCount(0);
});

test('the embed works inside an iframe on another page', async ({ page, baseURL, gallery, db }) => {
  const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
  const embedUrl = new URL(`/embed/${image.id}`, baseURL).toString();

  // A blank host page: writing over an app page that is still hydrating races React (#192).
  await page.setContent(`<iframe src="${embedUrl}" width="640" height="360"></iframe>`);
  await expect(page.frameLocator('iframe').getByRole('img', { name: 'Shared image', exact: true })).toBeVisible();
});

// A private file looks like a missing one, even to its owner, so an embed never needs a session.
for (const who of ['visitor', 'owner'] as const) {
  test(`a private file is unavailable to its ${who}`, async ({ page, galleryPage, gallery, db }) => {
    const secret = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });
    const viewer = who === 'owner' ? galleryPage : page;
    const response = await viewer.goto(`/embed/${secret.id}`);

    expect(response?.status()).toBe(404);
    await expect(viewer.getByText('This embed is unavailable.')).toBeVisible();
    await expect(viewer.getByRole('img', { name: 'Shared image' })).toHaveCount(0);
    await expect(viewer.getByText(secret.title)).toHaveCount(0);
  });
}

test('a file that does not exist is unavailable', async ({ page }) => {
  const response = await page.goto('/embed/no-such-file');

  expect(response?.status()).toBe(404);
  await expect(page.getByText('This embed is unavailable.')).toBeVisible();
});
