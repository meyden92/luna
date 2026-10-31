import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { fixtureUser } from '../fixtures/users';
import { clickUntil, untilHydrated } from '../utils/hydration';
import { servedFile } from '../utils/served-files';
import { submitLoginForm } from '../utils/sign-in';

// The public file page, `/view/<id>`, as a visitor and as signed-in users. The data is the gallery user's seeded
// files (read only, so nothing here uploads or changes anything).
//
// Known gap, not asserted: RustFS ignores per-object ACLs, so the raw bucket URL of a private object is readable.
// Privacy is asserted at the app's surfaces (/view, /embed, /cdn, /api/d, /api/download, /api/oembed), never there.

const metaContent = (page: Page, attribute: 'property' | 'name', key: string) =>
  page.locator(`meta[${attribute}="${key}"]`).getAttribute('content');

/**
 * Fetches a public bucket URL the page advertises. The CDN host (`host.docker.internal`) only resolves in the
 * browser, so the request goes to the same port on localhost; the bucket answers anonymous reads.
 */
async function fetchPublicObject(page: Page, url: string) {
  const reachable = new URL(url);
  reachable.hostname = '127.0.0.1';
  const response = await page.request.get(reachable.toString());
  return { status: response.status(), contentType: response.headers()['content-type'], body: await response.body() };
}

test.describe('a public file', () => {
  test('an image renders with its details and advertises itself to link previews', async ({ page, gallery, db }) => {
    const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
    const response = await page.goto(`/view/${image.id}`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: image.title })).toBeVisible();
    await expect(page.getByText('PUBLIC LINK', { exact: true })).toBeVisible();
    await expect(page.getByText('01 · PHOTO', { exact: true })).toBeVisible();
    await expect(page.getByText('Gallery User')).toBeVisible();

    const shown = page.getByRole('img', { name: 'Shared image', exact: true });
    await expect(shown).toHaveJSProperty('naturalWidth', image.entry.dimensions!.width);
    await expect(shown).toHaveJSProperty('naturalHeight', image.entry.dimensions!.height);
    await page.getByRole('button', { name: 'View full size' }).click();
    await expect(page.getByRole('dialog', { name: 'Full size image' })).toBeVisible();

    // What a link-preview crawler reads: a public file is indexable and every advertised URL loads.
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    expect(await metaContent(page, 'property', 'og:title')).toBe(image.title);
    expect(await metaContent(page, 'property', 'og:type')).toBe('article');
    expect(await metaContent(page, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(await metaContent(page, 'property', 'og:url')).toBe(`${page.url()}.jpg`);
    const ogImage = (await metaContent(page, 'property', 'og:image'))!;
    expect(await metaContent(page, 'name', 'twitter:image')).toBe(ogImage);
    const served = await fetchPublicObject(page, ogImage);
    expect(served.status).toBe(200);
    expect(served.contentType).toBe('image/jpeg');
    expect(served.body.equals(image.bytes)).toBe(true);

    const discovery = (await page.locator('link[rel="alternate"][type="application/json+oembed"]').getAttribute('href'))!;
    const oembed = await page.request.get(discovery);
    expect(oembed.status()).toBe(200);
    expect(await oembed.json()).toMatchObject({ type: 'rich', title: image.title });
  });

  test('a video plays and advertises its stream', async ({ page, gallery, db }) => {
    const video = await servedFile(gallery, db, 'clip.mp4', { private: false });
    await page.goto(`/view/${video.id}`);

    await expect(page.getByText('PUBLIC LINK', { exact: true })).toBeVisible();
    await expect(page.getByText('02 · VIDEO', { exact: true })).toBeVisible();
    const player = page.locator('video');
    await expect(player).toHaveJSProperty('videoWidth', video.entry.dimensions!.width);
    await expect(player).toHaveJSProperty('videoHeight', video.entry.dimensions!.height);
    expect(await player.evaluate((element: HTMLVideoElement) => element.duration)).toBeGreaterThan(0);
    // Muted playback is allowed without a gesture; the clock moving proves the stream decodes.
    await player.evaluate((element: HTMLVideoElement) => {
      element.muted = true;
      return element.play();
    });
    await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);

    expect(await metaContent(page, 'property', 'og:type')).toBe('video.other');
    const stream = (await metaContent(page, 'property', 'og:video'))!;
    expect(await metaContent(page, 'property', 'og:video:type')).toBe('video/mp4');
    expect(await metaContent(page, 'name', 'twitter:player')).toBe(page.url().replace('/view/', '/embed/'));
    const served = await fetchPublicObject(page, stream);
    expect(served.status).toBe(200);
    expect(served.body.equals(video.bytes)).toBe(true);
  });

  test('audio plays and advertises its stream', async ({ page, gallery, db }) => {
    // The first copy of tone.mp3 is private in the seed, so this is the second.
    const publicTone = await servedFile(gallery, db, 'tone.mp3', { private: false });
    await page.goto(`/view/${publicTone.id}`);

    await expect(page.getByText('03 · AUDIO', { exact: true })).toBeVisible();
    const player = page.locator('audio');
    await expect.poll(() => player.evaluate((element: HTMLAudioElement) => element.duration)).toBeCloseTo(3, 0);
    await player.evaluate((element: HTMLAudioElement) => element.play());
    await expect.poll(() => player.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0);

    expect(await metaContent(page, 'property', 'og:type')).toBe('music.song');
    const served = await fetchPublicObject(page, (await metaContent(page, 'property', 'og:audio'))!);
    expect(served.status).toBe(200);
    expect(served.body.equals(publicTone.bytes)).toBe(true);
  });

  for (const name of ['document.pdf', 'notes.txt', 'Ünïcödé 🌙 holiday notes.txt']) {
    test(`${name} has no in-browser preview, only its download`, async ({ page, gallery, db }) => {
      const other = await servedFile(gallery, db, name, { private: false });
      await page.goto(`/view/${other.id}`);

      await expect(page.getByRole('heading', { level: 1, name: other.title })).toBeVisible();
      await expect(page.getByText('04 · FILE', { exact: true })).toBeVisible();
      await expect(page.getByText('This file has no in-browser preview. Use the download button to open it.')).toBeVisible();
      await expect(page.locator('video, audio, iframe, object, embed, img[alt="Shared image"]')).toHaveCount(0);
      expect(await metaContent(page, 'property', 'og:title')).toBe(other.title);
      await expect(page.locator('meta[property="og:image"], meta[property="og:video"]')).toHaveCount(0);
    });
  }

  test('Copy link copies the share URL', async ({ page, gallery, db }) => {
    const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/view/${image.id}`);

    const copy = page.getByRole('button', { name: 'Copy link' }).first();
    await clickUntil(copy, page.getByRole('button', { name: 'Copied!' }).first());
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${page.url()}.jpg`);
  });

  test('the QR code dialog shows a code for the share URL', async ({ page, gallery, db }) => {
    const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
    await page.goto(`/view/${image.id}`);

    const dialog = page.getByRole('dialog', { name: 'QR code' });
    await clickUntil(page.getByRole('button', { name: 'QR code' }), dialog);
    const code = dialog.getByRole('img', { name: 'QR code for shared file' });
    await expect(code).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect(code).toHaveJSProperty('naturalWidth', 256);
    await expect(dialog.getByText(`${page.url()}.jpg`, { exact: true })).toBeVisible();
  });

  test('the page hydrates without a page error', async ({ page, gallery, db }) => {
    // A hydration mismatch makes React re-render the whole document, which races anything a spec does next (#192).
    const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/view/${image.id}`);

    await untilHydrated(page.getByRole('button', { name: 'Embed' }));
    expect(errors).toEqual([]);
  });

  test('the embed dialog gives a snippet that embeds the file', async ({ page, gallery, db }) => {
    const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/view/${image.id}`);

    const dialog = page.getByRole('dialog', { name: 'Embed' });
    await clickUntil(page.getByRole('button', { name: 'Embed' }), dialog);
    const snippet = (await dialog.locator('code').textContent())!;
    const embedUrl = new URL(`/embed/${image.id}`, page.url()).toString();
    expect(snippet).toContain(`src="${embedUrl}"`);

    await dialog.getByRole('button', { name: 'Copy embed code' }).click();
    await expect(dialog.getByRole('button', { name: 'Copied!' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(snippet);

    // The snippet's address is a page that shows the file on its own.
    await page.goto(embedUrl);
    await expect(page.getByRole('img', { name: 'Shared image', exact: true })).toBeVisible();
  });

  test('Download original saves the file under its own name', async ({ page, gallery, db }) => {
    const unicode = await servedFile(gallery, db, 'Ünïcödé 🌙 holiday notes.txt', { private: false });
    await page.goto(`/view/${unicode.id}`);

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download original' }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe(unicode.title);
    expect(readFileSync((await saved.path())!).equals(unicode.bytes)).toBe(true);
  });
});

test.describe('a private file', () => {
  test('a visitor is asked to sign in and learns nothing about the file', async ({ page, gallery, db }) => {
    const secret = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });
    await page.goto(`/view/${secret.id}`);

    await expect(page.getByRole('heading', { level: 1, name: 'This file is private' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in to view' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent(`/view/${secret.id}`)}`,
    );
    await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.locator('meta[property^="og:"], link[type="application/json+oembed"]')).toHaveCount(0);
    await expect(page.getByText(secret.title)).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Shared image' })).toHaveCount(0);
  });

  test("another signed-in user is told they don't have access", async ({ emptyPage, gallery, db }) => {
    const secret = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });
    await emptyPage.goto(`/view/${secret.id}`);

    await expect(emptyPage.getByRole('heading', { level: 1, name: 'This file is private' })).toBeVisible();
    await expect(emptyPage.getByText('Your account does not have access to this file.')).toBeVisible();
    await expect(emptyPage.getByRole('link', { name: 'Go to dashboard' })).toBeVisible();
    await expect(emptyPage.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(emptyPage.getByText(secret.title)).toHaveCount(0);
    await expect(emptyPage.getByRole('img', { name: 'Shared image' })).toHaveCount(0);
  });

  for (const viewer of ['gallery', 'admin'] as const) {
    test(`the ${viewer === 'gallery' ? 'owner' : 'admin'} sees the file`, async ({ galleryPage, adminPage, gallery, db }) => {
      const page = viewer === 'gallery' ? galleryPage : adminPage;
      const secret = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });
      await page.goto(`/view/${secret.id}`);

      await expect(page.getByRole('heading', { level: 1, name: secret.title })).toBeVisible();
      await expect(page.getByText('PRIVATE LINK', { exact: true })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
      await expect(page.locator('meta[property^="og:"]')).toHaveCount(0);
      const shown = page.getByRole('img', { name: 'Shared image', exact: true });
      await expect(shown).toHaveJSProperty('naturalWidth', secret.entry.dimensions!.width);
      await expect(shown).toHaveJSProperty('naturalHeight', secret.entry.dimensions!.height);
    });
  }

  test('a private audio file plays for its owner', async ({ galleryPage, gallery, db }) => {
    const tone = await servedFile(gallery, db, 'tone.mp3', { private: true });
    await galleryPage.goto(`/view/${tone.id}`);

    await expect(galleryPage.getByText('PRIVATE LINK', { exact: true })).toBeVisible();
    await expect.poll(() => galleryPage.locator('audio').evaluate((element: HTMLAudioElement) => element.duration)).toBeCloseTo(3, 0);
  });
});

test('a file that does not exist shows the not-found page', async ({ page }) => {
  const response = await page.goto('/view/no-such-file');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'File not found' })).toBeVisible();
  await expect(page.getByText('This shared file may have been deleted, or the link may be incorrect.')).toBeVisible();
});

test('the sign-in link on a private file comes back to it', async ({ page, gallery, db }) => {
  const secret = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });
  const owner = fixtureUser('gallery');
  await page.goto(`/view/${secret.id}`);
  await page.getByRole('link', { name: 'Sign in to view' }).click();
  await expect(page).toHaveURL(/\/login\?redirect=/);

  await submitLoginForm(page, owner.username, owner.password);
  await expect(page).toHaveURL(`/view/${secret.id}`);
  await expect(page.getByRole('heading', { level: 1, name: secret.title })).toBeVisible();
});

// Discord renders a bare inline image only for a link ending in an image extension whose response is the image,
// so image share links carry the extension and Discord's crawler is redirected to the raw file.
test.describe('a link pasted into Discord', () => {
  const DISCORDBOT = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';

  test('a browser opening the extensioned link gets the share page', async ({ page, gallery, db }) => {
    const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
    const response = await page.goto(`/view/${image.id}.jpg`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: image.title })).toBeVisible();
  });

  test("Discord's crawler is redirected to the public image's bytes", async ({ request, gallery, db }) => {
    const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
    const response = await request.get(`/view/${image.id}.jpg`, { headers: { 'user-agent': DISCORDBOT }, maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe(`/api/d/${image.id}`);
    expect(response.headers().vary).toBe('User-Agent');
    const served = await request.get(response.headers().location!, { headers: { 'user-agent': DISCORDBOT } });
    expect(served.headers()['content-type']).toBe('image/jpeg');
    expect((await served.body()).equals(image.bytes)).toBe(true);
  });

  for (const [what, name, isPrivate] of [
    ['a private image', 'portrait-tall.webp', true],
    ['a public video', 'clip.mp4', false],
  ] as const) {
    test(`Discord's crawler gets the page for ${what}`, async ({ request, gallery, db }) => {
      const file = await servedFile(gallery, db, name, { private: isPrivate });
      const response = await request.get(`/view/${file.id}`, { headers: { 'user-agent': DISCORDBOT }, maxRedirects: 0 });

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/html');
    });
  }

  test('oEmbed resolves the extensioned link', async ({ request, stack, gallery, db }) => {
    const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
    const response = await request.get('/api/oembed', { params: { url: `${stack.E2E_BASE_URL}/view/${image.id}.jpg` } });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ title: image.title });
  });
});
