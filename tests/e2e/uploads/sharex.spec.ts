import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { file } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { SHAREX_MAX_UPLOAD_BYTES } from '../stack-env';
import { uniquePrefix } from '../utils/own-files';
import { createToken, declaredLengthPost, revokeToken, sharexPost, storedFile, withToken } from '../utils/uploads';

// ShareX uploads: the Token in the header or the form, the links the response hands back,
// and the refusals. Serial, so the stack's ShareX concurrency of 2 is never approached.
test.describe.configure({ mode: 'serial' });

test('a Token in the Authorization header uploads, and the link and thumbnail load in the browser', async ({
  workerPage,
  playwright,
  stack,
  corpus,
  db,
  bucket,
}) => {
  const entry = corpus.file('landscape-photo.jpg');
  const name = `${uniquePrefix('sx-header')} ${entry.name}`;
  const bytes = readFileSync(entry.path);

  await withToken(workerPage, 'sx-header-token', async (key) => {
    const { status, body } = await sharexPost(
      playwright,
      stack.E2E_BASE_URL,
      { name, mimeType: entry.mimeType, buffer: bytes },
      { bearer: key },
    );
    expect(status).toBe(200);
    const { link, thumbnail } = (body as { data: { link: string; thumbnail: string } }).data;

    const stored = await storedFile(db, bucket, name);
    expect(stored.bytes.equals(bytes)).toBe(true);
    expect(stored.contentType).toBe('image/jpeg');
    const [ownerId, storedName] = stored.key.split('/');
    expect(link).toBe(`${stack.E2E_CDN_URL}/${ownerId}/${encodeURIComponent(storedName!)}`);
    expect(thumbnail).toBe(link);

    // Both URLs serve the stored bytes, and the browser renders the image.
    for (const url of [link, thumbnail]) {
      // The CDN host only resolves inside the browser, so load it as a page.
      const fetched = (await workerPage.goto(url))!;
      expect(fetched.ok()).toBe(true);
      expect(await fetched.headerValue('content-type')).toBe('image/jpeg');
      expect((await fetched.body()).equals(bytes)).toBe(true);
      await expect(workerPage.locator('img')).toHaveJSProperty('naturalWidth', entry.dimensions!.width);
    }
  });
});

test('a Token in the form field uploads', async ({ workerPage, playwright, stack, corpus, db, bucket }) => {
  const entry = corpus.file('notes.txt');
  const name = `${uniquePrefix('sx-form')} ${entry.name}`;

  await withToken(workerPage, 'sx-form-token', async (key) => {
    const { status, body } = await sharexPost(
      playwright,
      stack.E2E_BASE_URL,
      { name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) },
      { formToken: key },
    );
    expect(status).toBe(200);
    const link = (body as { data: { link: string } }).data.link;

    const stored = await storedFile(db, bucket, name);
    expect(stored.bytes.equals(readFileSync(entry.path))).toBe(true);
    const response = (await workerPage.goto(link))!;
    expect(response.ok()).toBe(true);
    expect((await response.body()).equals(readFileSync(entry.path))).toBe(true);
  });
});

test('a request without a Token is refused with 401', async ({ playwright, stack, corpus }) => {
  const entry = corpus.file('notes.txt');

  const { status, body } = await sharexPost(playwright, stack.E2E_BASE_URL, {
    name: entry.name,
    mimeType: entry.mimeType,
    buffer: readFileSync(entry.path),
  });

  expect(status).toBe(401);
  expect(body).toEqual({ error: 'Missing authentication token', code: 'UNAUTHORIZED' });
});

test('a revoked Token is refused with 401 and nothing is stored', async ({ workerPage, playwright, stack, corpus, db }) => {
  const entry = corpus.file('notes.txt');
  const name = `${uniquePrefix('sx-revoked')} ${entry.name}`;
  const tokenName = uniquePrefix('sx-revoked-token');
  const key = await createToken(workerPage, tokenName);
  const upload = { name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) };

  expect((await sharexPost(playwright, stack.E2E_BASE_URL, upload, { bearer: key })).status).toBe(200);
  await revokeToken(workerPage, tokenName);
  const afterwards = await sharexPost(playwright, stack.E2E_BASE_URL, { ...upload, name: `again ${name}` }, { bearer: key });

  expect(afterwards.status).toBe(401);
  expect(afterwards.body).toEqual({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  expect(
    await db
      .select()
      .from(file)
      .where(eq(file.title, `again ${name}`)),
  ).toHaveLength(0);
});

test('a request declaring more than the ShareX limit is refused with 413 before any bytes are sent', async ({ workerPage, stack }) => {
  await withToken(workerPage, 'sx-declared-token', async (key) => {
    const declared = SHAREX_MAX_UPLOAD_BYTES + 2 * 1024 * 1024;

    const result = await declaredLengthPost(stack.E2E_BASE_URL, '/api/upload/sharex', { Authorization: `Bearer ${key}` }, declared);

    expect(result.status).toBe(413);
    expect(JSON.parse(result.body)).toEqual({ error: 'File too large', code: 'PAYLOAD_TOO_LARGE' });
  });
});

test('a file one byte over the ShareX limit is refused with 413 and nothing is stored', async ({ workerPage, playwright, stack, db }) => {
  const name = `${uniquePrefix('sx-big')}.txt`;

  await withToken(workerPage, 'sx-big-token', async (key) => {
    const { status, body } = await sharexPost(
      playwright,
      stack.E2E_BASE_URL,
      { name, mimeType: 'text/plain', buffer: Buffer.alloc(SHAREX_MAX_UPLOAD_BYTES + 1, 'a') },
      { bearer: key },
    );
    expect(status).toBe(413);
    expect(body).toEqual({ error: 'File too large', code: 'PAYLOAD_TOO_LARGE' });
    expect(await db.select().from(file).where(eq(file.title, name))).toHaveLength(0);
  });
});
