import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { servedFile } from '../utils/served-files';

// `/api/oembed`: what other sites call to embed a shared file.
// Known gap, not asserted: RustFS ignores per-object ACLs, so a private object is readable at its raw bucket URL.

test('a public view URL gets a rich embed with its iframe and size', async ({ request, stack, gallery, db }) => {
  const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
  const viewUrl = `${stack.E2E_BASE_URL}/view/${image.id}`;
  const response = await request.get('/api/oembed', { params: { url: viewUrl, format: 'json' } });

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['cache-control']).toBe('public, max-age=300');
  const body = await response.json();
  expect(body).toMatchObject({
    version: '1.0',
    type: 'rich',
    provider_name: 'LunaShare',
    provider_url: stack.E2E_BASE_URL,
    title: image.title,
    author_name: 'Gallery User',
    width: 640,
    height: 360,
  });
  expect(body.html).toContain(`<iframe src="${stack.E2E_BASE_URL}/embed/${image.id}"`);
  expect(body.html).toContain('width="640" height="360"');
  expect(body.thumbnail_url.startsWith(`${stack.E2E_CDN_URL}/`)).toBe(true);
});

test('maxwidth and maxheight shrink the embed but never grow it', async ({ request, stack, gallery, db }) => {
  const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
  const url = `${stack.E2E_BASE_URL}/view/${image.id}`;

  const small = await (await request.get('/api/oembed', { params: { url, maxwidth: '320', maxheight: '200' } })).json();
  expect(small).toMatchObject({ width: 320, height: 200 });
  expect(small.html).toContain('width="320" height="200"');

  const large = await (await request.get('/api/oembed', { params: { url, maxwidth: '2000', maxheight: '2000' } })).json();
  expect(large).toMatchObject({ width: 640, height: 360 });
});

test('a video has no thumbnail', async ({ request, stack, gallery, db }) => {
  const video = await servedFile(gallery, db, 'clip.mp4', { private: false });
  const response = await request.get('/api/oembed', { params: { url: `${stack.E2E_BASE_URL}/view/${video.id}`, format: 'json' } });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ type: 'rich', title: video.title });
  expect(body.thumbnail_url).toBeUndefined();
});

test('only JSON is supported: format=xml answers 501', async ({ request, stack, gallery, db }) => {
  const image = await servedFile(gallery, db, 'forest-path.jpg', { private: false });
  const response = await request.get('/api/oembed', { params: { url: `${stack.E2E_BASE_URL}/view/${image.id}`, format: 'xml' } });

  expect(response.status()).toBe(501);
  expect(await response.json()).toEqual({ error: 'Only JSON oEmbed is supported' });
});

for (const who of ['visitor', 'owner'] as const) {
  test(`a private file's view URL is refused even to its ${who}`, async ({ request, galleryRequest, stack, gallery, db }) => {
    const secret = await servedFile(gallery, db, 'portrait-tall.webp', { private: true });
    const client = who === 'owner' ? galleryRequest : request;
    const response = await client.get('/api/oembed', { params: { url: `${stack.E2E_BASE_URL}/view/${secret.id}`, format: 'json' } });

    // It looks like a missing file, so nothing about it is confirmed.
    expect(response.status()).toBe(404);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: 'File not found' });
    expect(text).not.toContain(secret.title);
  });
}

test('a file that does not exist is not found', async ({ request, stack }) => {
  const response = await request.get('/api/oembed', { params: { url: `${stack.E2E_BASE_URL}/view/no-such-file` } });

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ error: 'File not found' });
});

test('a request without a usable /view URL is a 400', async ({ request, stack }) => {
  const missing = await request.get('/api/oembed');
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toEqual({ error: 'url is required' });

  for (const url of [`${stack.E2E_BASE_URL}/privacy`, 'not a url']) {
    const response = await request.get('/api/oembed', { params: { url } });
    expect(response.status(), url).toBe(400);
    expect(await response.json()).toEqual({ error: 'A public /view/{id} URL is required' });
  }
});
