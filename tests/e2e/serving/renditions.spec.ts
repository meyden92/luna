import { type APIRequestContext, expect } from '@playwright/test';
import sharp from 'sharp';
import { test } from '../fixtures/test';
import { servedFile } from '../utils/served-files';

// `/cdn/<id>/<params>`: resized, rotated and re-encoded copies of an image, produced by sharp and cached.
// Expected sizes follow from the corpus: landscape-photo.jpg is 2400x1600.
//
// Known gap, not asserted: RustFS ignores per-object ACLs, so a private object is readable at its raw bucket URL.
// A private image's rendition needs a signed URL (`?exp&sig`). No screen of the app builds one (the signing helper
// has no caller), so only the refusals are asserted; a valid signature cannot be read from a page.

const SOURCE = { width: 2400, height: 1600 };

/** Fetches a rendition and decodes it, so assertions compare the real format and pixel size. */
async function rendition(request: APIRequestContext, id: string, params: string, headers?: Record<string, string>) {
  const response = await request.get(`/cdn/${id}/${params}`, { headers });
  expect(response.status(), params).toBe(200);
  const body = await response.body();
  return { response, metadata: await sharp(body).metadata(), body };
}

test.describe('a public image', () => {
  test('width alone keeps the aspect ratio', async ({ request, gallery, db }) => {
    const image = await servedFile(gallery, db, 'landscape-photo.jpg', { private: false });
    const { response, metadata } = await rendition(request, image.id, 'w=800,fmt=jpeg');

    expect(response.headers()['content-type']).toBe('image/jpeg');
    expect(response.headers()['cache-control']).toBe('public, immutable, max-age=31536000');
    expect(metadata).toMatchObject({ format: 'jpeg', width: 800, height: 533 });
  });

  test('a smaller box fits the image inside it, and the image is never enlarged', async ({ request, gallery, db }) => {
    const image = await servedFile(gallery, db, 'landscape-photo.jpg', { private: false });

    expect((await rendition(request, image.id, 'w=300,h=300,fmt=png')).metadata).toMatchObject({ width: 300, height: 200 });
    expect((await rendition(request, image.id, 'w=300,h=300,fit=fill,fmt=png')).metadata).toMatchObject({ width: 300, height: 300 });
    expect((await rendition(request, image.id, 'w=4000,fmt=png')).metadata).toMatchObject(SOURCE);
  });

  test('rot turns the image', async ({ request, gallery, db }) => {
    const image = await servedFile(gallery, db, 'landscape-photo.jpg', { private: false });

    expect((await rendition(request, image.id, 'rot=90,fmt=png')).metadata).toMatchObject({ width: SOURCE.height, height: SOURCE.width });
    expect((await rendition(request, image.id, 'rot=180,fmt=png')).metadata).toMatchObject(SOURCE);
    expect((await rendition(request, image.id, 'w=400,rot=270,fmt=png')).metadata).toMatchObject({ width: 400, height: 600 });
  });

  test('dpr scales the requested size', async ({ request, gallery, db }) => {
    const image = await servedFile(gallery, db, 'landscape-photo.jpg', { private: false });

    expect((await rendition(request, image.id, 'w=300,dpr=2,fmt=png')).metadata).toMatchObject({ width: 600, height: 400 });
  });

  for (const [fmt, contentType, decodedFormat] of [
    ['jpeg', 'image/jpeg', 'jpeg'],
    ['png', 'image/png', 'png'],
    ['webp', 'image/webp', 'webp'],
    // sharp reports AVIF as its HEIF container.
    ['avif', 'image/avif', 'heif'],
  ] as const) {
    test(`fmt=${fmt} answers ${contentType} at the requested size`, async ({ request, gallery, db }) => {
      const image = await servedFile(gallery, db, 'landscape-photo.jpg', { private: false });
      const { response, metadata, body } = await rendition(request, image.id, `w=600,fmt=${fmt}`);

      expect(response.headers()['content-type']).toBe(contentType);
      expect(response.headers()['content-length']).toBe(String(body.byteLength));
      expect(metadata).toMatchObject({ format: decodedFormat, width: 600, height: 400 });
    });
  }

  test('lower quality makes a smaller file', async ({ request, gallery, db }) => {
    const image = await servedFile(gallery, db, 'landscape-photo.jpg', { private: false });
    const low = await rendition(request, image.id, 'w=800,fmt=jpeg,q=20');
    const high = await rendition(request, image.id, 'w=800,fmt=jpeg,q=95');

    expect(low.body.byteLength).toBeLessThan(high.body.byteLength);
  });

  test('without fmt the format follows the Accept header', async ({ request, gallery, db }) => {
    const image = await servedFile(gallery, db, 'landscape-photo.jpg', { private: false });

    expect((await rendition(request, image.id, 'w=200', { accept: 'image/avif,image/webp,*/*' })).response.headers()['content-type']).toBe(
      'image/avif',
    );
    expect((await rendition(request, image.id, 'w=201', { accept: 'image/webp,*/*' })).response.headers()['content-type']).toBe(
      'image/webp',
    );
    expect((await rendition(request, image.id, 'w=202', { accept: '*/*' })).response.headers()['content-type']).toBe('image/jpeg');
  });

  test('asking twice serves the same bytes', async ({ request, gallery, db }) => {
    const image = await servedFile(gallery, db, 'landscape-photo.jpg', { private: false });
    const first = await rendition(request, image.id, 'w=500,fmt=webp');
    const second = await rendition(request, image.id, 'w=500,fmt=webp');

    expect(second.body.equals(first.body)).toBe(true);
  });
});

test('an unknown image is 404', async ({ request }) => {
  expect((await request.get('/cdn/no-such-file/w=100,fmt=png')).status()).toBe(404);
});

test('a file that is not an image is 404', async ({ request, gallery, db }) => {
  const pdf = await servedFile(gallery, db, 'document.pdf', { private: false });

  expect((await request.get(`/cdn/${pdf.id}/w=100,fmt=png`)).status()).toBe(404);
});

test.describe('a private image', () => {
  const FUTURE = () => String(Date.now() + 10 * 60_000);

  test('is refused without a signature, even to its owner', async ({ request, galleryRequest, gallery, db }) => {
    const secret = await servedFile(gallery, db, 'landscape-photo.jpg', { private: true });

    for (const client of [request, galleryRequest]) {
      const response = await client.get(`/cdn/${secret.id}/w=100,fmt=png`);
      expect(response.status()).toBe(403);
      expect(await response.text()).toBe('Forbidden');
    }
  });

  test('is refused with a tampered, missing-half or expired signature', async ({ request, gallery, db }) => {
    const secret = await servedFile(gallery, db, 'landscape-photo.jpg', { private: true });
    const other = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });
    const path = `/cdn/${secret.id}/w=100,fmt=png`;

    for (const query of [
      `?exp=${FUTURE()}&sig=not-a-signature`,
      `?exp=${FUTURE()}&sig=${'A'.repeat(43)}`,
      `?exp=${FUTURE()}`,
      `?sig=${'A'.repeat(43)}`,
      `?exp=${Date.now() - 60_000}&sig=${'A'.repeat(43)}`,
    ]) {
      expect((await request.get(`${path}${query}`)).status(), query).toBe(403);
    }
    // Another file's rendition is not reachable through this one's path either.
    expect((await request.get(`/cdn/${other.id}/w=100,fmt=png?exp=${FUTURE()}&sig=${'A'.repeat(43)}`)).status()).toBe(403);
  });
});
