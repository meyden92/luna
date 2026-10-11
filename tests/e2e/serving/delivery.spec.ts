import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { unzipSync } from 'fflate';
import { test } from '../fixtures/test';
import { uniquePrefix, uploadOwnFiles } from '../utils/own-files';
import { servedFile } from '../utils/served-files';

// Streaming (`/api/d/<id>`), downloads (`/api/download?id=`) and zip downloads (`/api/download-zip`).
// The data is the gallery user's seeded files, read only.
//
// Known gap, not asserted: RustFS ignores per-object ACLs, so the raw bucket URL of a private object is readable.
// Privacy is asserted at the app's routes, never at the bucket.

test.describe('/api/d', () => {
  test('streams a public video whole, with the headers a player needs', async ({ request, gallery, db }) => {
    const video = await servedFile(gallery, db, 'clip.mp4', { private: false });
    const response = await request.get(`/api/d/${video.id}`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('video/mp4');
    expect(response.headers()['accept-ranges']).toBe('bytes');
    expect(response.headers()['cache-control']).toBe('public, max-age=3600');
    expect((await response.body()).equals(video.bytes)).toBe(true);
  });

  test('Range bytes=0-99 answers 206 with exactly those 100 bytes', async ({ request, gallery, db }) => {
    const video = await servedFile(gallery, db, 'clip.mp4', { private: false });
    const response = await request.get(`/api/d/${video.id}`, { headers: { range: 'bytes=0-99' } });

    expect(response.status()).toBe(206);
    expect(response.headers()['content-range']).toBe(`bytes 0-99/${video.bytes.byteLength}`);
    expect(response.headers()['content-length']).toBe('100');
    const body = await response.body();
    expect(body.byteLength).toBe(100);
    expect(body.equals(video.bytes.subarray(0, 100))).toBe(true);
  });

  test('other ranges (from the middle, to the end) return the matching bytes', async ({ request, gallery, db }) => {
    const video = await servedFile(gallery, db, 'clip.mp4', { private: false });
    const total = video.bytes.byteLength;

    const middle = await request.get(`/api/d/${video.id}`, { headers: { range: 'bytes=1000-1999' } });
    expect(middle.status()).toBe(206);
    expect(middle.headers()['content-range']).toBe(`bytes 1000-1999/${total}`);
    expect((await middle.body()).equals(video.bytes.subarray(1000, 2000))).toBe(true);

    const tail = await request.get(`/api/d/${video.id}`, { headers: { range: 'bytes=13000-' } });
    expect(tail.status()).toBe(206);
    expect(tail.headers()['content-range']).toBe(`bytes 13000-${total - 1}/${total}`);
    expect((await tail.body()).equals(video.bytes.subarray(13000))).toBe(true);
  });

  test('an unknown file is 404', async ({ request }) => {
    expect((await request.get('/api/d/no-such-file')).status()).toBe(404);
  });

  test.describe('a private file', () => {
    test('is refused to a visitor and to another signed-in user', async ({ request, emptyRequest, gallery, db }) => {
      const tone = await servedFile(gallery, db, 'tone.mp3', { private: true });

      for (const client of [request, emptyRequest]) {
        const response = await client.get(`/api/d/${tone.id}`);
        expect(response.status()).toBe(403);
        expect(await response.text()).toBe('Forbidden');
        const ranged = await client.get(`/api/d/${tone.id}`, { headers: { range: 'bytes=0-99' } });
        expect(ranged.status()).toBe(403);
      }
    });

    test('is served to its owner, with a private cache policy', async ({ galleryRequest, gallery, db }) => {
      const tone = await servedFile(gallery, db, 'tone.mp3', { private: true });
      const response = await galleryRequest.get(`/api/d/${tone.id}`);

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('audio/mpeg');
      expect(response.headers()['cache-control']).toBe('private, max-age=60');
      expect((await response.body()).equals(tone.bytes)).toBe(true);

      const ranged = await galleryRequest.get(`/api/d/${tone.id}`, { headers: { range: 'bytes=0-99' } });
      expect(ranged.status()).toBe(206);
      expect((await ranged.body()).equals(tone.bytes.subarray(0, 100))).toBe(true);
    });

    test('is served to a context holding the delivery cookie from the owner-authorised view, for that file only', async ({
      galleryPage,
      playwright,
      stack,
      gallery,
      db,
    }) => {
      const tone = await servedFile(gallery, db, 'tone.mp3', { private: true });
      const otherPrivate = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });

      await galleryPage.goto(`/view/${tone.id}`);
      await expect(galleryPage.getByRole('heading', { level: 1, name: tone.title })).toBeVisible();
      const delivery = (await galleryPage.context().cookies()).filter((cookie) => cookie.name === 'ls_dlv');
      expect(delivery).toHaveLength(1);
      expect(delivery[0]).toMatchObject({ path: '/api/d', httpOnly: true });

      // Someone else's client: nothing but the delivery cookie, no session.
      const holder = await playwright.request.newContext({ baseURL: stack.E2E_BASE_URL, storageState: { cookies: delivery, origins: [] } });
      try {
        const response = await holder.get(`/api/d/${tone.id}`);
        expect(response.status()).toBe(200);
        expect((await response.body()).equals(tone.bytes)).toBe(true);
        expect((await holder.get(`/api/d/${otherPrivate.id}`)).status()).toBe(403);
      } finally {
        await holder.dispose();
      }
    });
  });
});

test.describe('/api/download', () => {
  test('redirects a public file to a presigned URL that names the file', async ({ request, gallery, db }) => {
    const unicode = await servedFile(gallery, db, 'Ünïcödé 🌙 holiday notes.txt', { private: false });
    const response = await request.get(`/api/download?id=${unicode.id}`, { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    const location = new URL(response.headers().location!);
    expect(location.searchParams.get('X-Amz-Signature')).toBeTruthy();
    // The original name travels as an RFC 5987 `filename*`, with an ASCII fallback.
    const disposition = location.searchParams.get('response-content-disposition')!;
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent(unicode.title)}`);
    expect(disposition.startsWith('attachment; ')).toBe(true);
  });

  test('saves the Unicode file under its own name with its own bytes', async ({ page, gallery, db }) => {
    const unicode = await servedFile(gallery, db, 'Ünïcödé 🌙 holiday notes.txt', { private: false });
    const download = page.waitForEvent('download');
    // Navigating to an attachment is not a page load, so the goto itself is expected to fail.
    await page.goto(`/api/download?id=${unicode.id}`).catch(() => undefined);
    const saved = await download;

    expect(saved.suggestedFilename()).toBe('Ünïcödé 🌙 holiday notes.txt');
    expect(readFileSync((await saved.path())!).equals(unicode.bytes)).toBe(true);
  });

  test('a missing id is 400 and an unknown file is 404', async ({ request }) => {
    const missing = await request.get('/api/download', { maxRedirects: 0 });
    expect(missing.status()).toBe(400);
    expect(await missing.json()).toEqual({ error: 'File id required' });

    const unknown = await request.get('/api/download?id=no-such-file', { maxRedirects: 0 });
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'File not found' });
  });

  test.describe('a private file', () => {
    test('is refused to a visitor (401) and another signed-in user (403)', async ({ request, emptyRequest, gallery, db }) => {
      const secret = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });

      const visitor = await request.get(`/api/download?id=${secret.id}`, { maxRedirects: 0 });
      expect(visitor.status()).toBe(401);
      expect(await visitor.json()).toEqual({ error: 'Unauthorized' });

      const stranger = await emptyRequest.get(`/api/download?id=${secret.id}`, { maxRedirects: 0 });
      expect(stranger.status()).toBe(403);
      expect(await stranger.json()).toEqual({ error: 'Forbidden' });
    });

    for (const who of ['owner', 'admin'] as const) {
      test(`is allowed for the ${who}`, async ({ galleryRequest, adminRequest, gallery, db }) => {
        const secret = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });
        const response = await (who === 'owner' ? galleryRequest : adminRequest).get(`/api/download?id=${secret.id}`, { maxRedirects: 0 });

        expect(response.status()).toBe(302);
        expect(new URL(response.headers().location!).searchParams.get('response-content-disposition')).toContain(
          encodeURIComponent(secret.title),
        );
      });
    }

    test("is saved with the owner's bytes", async ({ galleryPage, gallery, db }) => {
      const secret = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });
      const download = galleryPage.waitForEvent('download');
      await galleryPage.goto(`/api/download?id=${secret.id}`).catch(() => undefined);
      const saved = await download;

      expect(saved.suggestedFilename()).toBe(secret.title);
      expect(readFileSync((await saved.path())!).equals(secret.bytes)).toBe(true);
    });
  });
});

test.describe('/api/download-zip', () => {
  test('contains exactly the requested files, byte for byte', async ({ galleryRequest, gallery, db }) => {
    const wanted = [
      await servedFile(gallery, db, 'notes.txt', { private: false }),
      await servedFile(gallery, db, 'document.pdf', { private: false }),
      // Private files are the owner's to zip.
      await servedFile(gallery, db, 'tone.mp3', { private: true }),
    ];
    const skipped = await servedFile(gallery, db, 'readme.md', { private: false });
    const response = await galleryRequest.post('/api/download-zip', { data: { ids: wanted.map((file) => file.id) } });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/zip');
    expect(response.headers()['content-disposition']).toBe('attachment; filename="lunashare-3-files.zip"');
    const entries = unzipSync(new Uint8Array(await response.body()));
    expect(Object.keys(entries).sort()).toEqual(wanted.map((file) => file.title).sort());
    expect(Object.keys(entries)).not.toContain(skipped.title);
    for (const file of wanted) expect(Buffer.from(entries[file.title]!).equals(file.bytes), file.title).toBe(true);
  });

  test("another user's file id is a 404, and nothing of the rest is returned", async ({ workerRequest, emptyRequest, gallery, db }) => {
    const theirs = await servedFile(gallery, db, 'notes.txt', { private: false });
    const privateOne = await servedFile(gallery, db, 'tone.mp3', { private: true });

    for (const client of [workerRequest, emptyRequest]) {
      for (const file of [theirs, privateOne]) {
        const response = await client.post('/api/download-zip', { data: { ids: [file.id] } });
        expect(response.status(), file.title).toBe(404);
        expect(await response.json()).toEqual({ error: 'One or more files could not be downloaded' });
      }
    }
  });

  test('one foreign id fails the whole request, even next to a file of your own', async ({ workerRequest, corpus, gallery, db }) => {
    const [own] = await uploadOwnFiles(workerRequest, uniquePrefix('zip'), [corpus.file('notes.txt')]);
    const foreign = await servedFile(gallery, db, 'notes.txt', { private: false });

    const mixed = await workerRequest.post('/api/download-zip', { data: { ids: [own!.id, foreign.id] } });
    expect(mixed.status()).toBe(404);
    expect(mixed.headers()['content-type']).toContain('application/json');
    expect((await workerRequest.post('/api/download-zip', { data: { ids: [own!.id] } })).status()).toBe(200);
  });

  test('a visitor is 401', async ({ request, gallery, db }) => {
    const file = await servedFile(gallery, db, 'notes.txt', { private: false });
    const response = await request.post('/api/download-zip', { data: { ids: [file.id] } });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  test('a body without ids is a 400', async ({ galleryRequest }) => {
    for (const data of [{ ids: [] }, {}, { ids: 'x' }]) {
      const response = await galleryRequest.post('/api/download-zip', { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid download request' });
    }
  });
});
