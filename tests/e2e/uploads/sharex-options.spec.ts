import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import exifr from 'exifr';
import sharp from 'sharp';
import { test } from '../fixtures/test';
import { createFolderThroughSidebar, folderIdOf, uniquePrefix } from '../utils/own-files';
import { setTokenOptions, sharexPost, storedFile, withToken } from '../utils/uploads';

// What a Token's options do to a ShareX upload. The options apply to all of the user's Tokens
// and every test makes and revokes its own, so they never reach another spec. Serial: the
// options are the worker user's, shared by the tests below.
test.describe.configure({ mode: 'serial' });

const OFF = { compressImage: false, convertToJpeg: false, jpegQuality: 80 };

test('converting to JPEG stores a JPEG whose name ends in .jpg', async ({ workerPage, playwright, stack, corpus, db, bucket }) => {
  const entry = corpus.file('transparent-logo.png');
  const name = `${uniquePrefix('sx-jpg')} ${entry.name}`;

  await withToken(workerPage, 'sx-jpg-token', async (key) => {
    await setTokenOptions(workerPage, { ...OFF, compressImage: true, convertToJpeg: true });
    const { status } = await sharexPost(
      playwright,
      stack.E2E_BASE_URL,
      { name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) },
      { bearer: key },
    );
    expect(status).toBe(200);

    const stored = await storedFile(db, bucket, name.replace(/\.png$/, '.jpg'));
    expect(stored.contentType).toBe('image/jpeg');
    expect((await sharp(stored.bytes).metadata()).format).toBe('jpeg');
    expect(stored.key.endsWith('.jpg')).toBe(true);
  });
});

test('a lower JPEG quality stores a smaller file than the source, and a higher one a larger file', async ({
  workerPage,
  playwright,
  stack,
  corpus,
  db,
  bucket,
}) => {
  const entry = corpus.file('landscape-photo.jpg');
  const source = readFileSync(entry.path);
  const sizes: Record<number, number> = {};

  await withToken(workerPage, 'sx-quality-token', async (key) => {
    for (const quality of [40, 95]) {
      await setTokenOptions(workerPage, { ...OFF, compressImage: true, jpegQuality: quality });
      const name = `${uniquePrefix(`sx-q${quality}`)} ${entry.name}`;
      const { status } = await sharexPost(
        playwright,
        stack.E2E_BASE_URL,
        { name, mimeType: entry.mimeType, buffer: source },
        { bearer: key },
      );
      expect(status).toBe(200);
      const stored = await storedFile(db, bucket, name);
      expect((await sharp(stored.bytes).metadata()).format).toBe('jpeg');
      sizes[quality] = stored.size;
    }
  });

  expect(sizes[40]).toBeLessThan(entry.size);
  expect(sizes[40]).toBeLessThan(sizes[95]!);
});

test('without compression the image is stored as sent', async ({ workerPage, playwright, stack, corpus, db, bucket }) => {
  const entry = corpus.file('landscape-photo.jpg');
  const name = `${uniquePrefix('sx-plain')} ${entry.name}`;

  await withToken(workerPage, 'sx-plain-token', async (key) => {
    await setTokenOptions(workerPage, OFF);
    const { status } = await sharexPost(
      playwright,
      stack.E2E_BASE_URL,
      { name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) },
      { bearer: key },
    );
    expect(status).toBe(200);
    expect((await storedFile(db, bucket, name)).bytes.equals(readFileSync(entry.path))).toBe(true);
  });
});

test('"Remove photo location" strips the stored photo, and leaving it off keeps the location', async ({
  workerPage,
  playwright,
  stack,
  corpus,
  db,
  bucket,
}) => {
  const entry = corpus.edgeCase('gps-exif');
  const upload = (name: string) => ({ name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) });
  const kept = `${uniquePrefix('sx-keep')} ${entry.name}`;
  const stripped = `${uniquePrefix('sx-strip')} ${entry.name}`;

  await withToken(workerPage, 'sx-strip-token', async (key) => {
    await workerPage.goto('/settings');
    const toggle = workerPage.getByRole('switch');
    await expect(toggle).not.toBeChecked();
    expect((await sharexPost(playwright, stack.E2E_BASE_URL, upload(kept), { bearer: key })).status).toBe(200);

    await toggle.click();
    await expect(toggle).toBeChecked();
    expect((await sharexPost(playwright, stack.E2E_BASE_URL, upload(stripped), { bearer: key })).status).toBe(200);
  });

  expect(await exifr.gps((await storedFile(db, bucket, kept)).bytes)).toBeDefined();
  const scrubbed = await storedFile(db, bucket, stripped);
  expect(await exifr.gps(scrubbed.bytes)).toBeUndefined();
  expect((scrubbed.scrubReport as { stripped: boolean }).stripped).toBe(true);
});

test('the default folder receives ShareX uploads', async ({ workerPage, playwright, stack, corpus, db, bucket }) => {
  const entry = corpus.file('notes.txt');
  const prefix = uniquePrefix('sx-folder');
  const folder = `${prefix}-box`;
  const name = `${prefix} ${entry.name}`;
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, folder);

  await withToken(workerPage, 'sx-folder-token', async (key) => {
    await workerPage.goto('/settings');
    await workerPage.getByRole('combobox').filter({ hasText: 'Not in a folder' }).click();
    await workerPage.getByRole('option', { name: folder }).click();
    await expect(workerPage.getByRole('combobox').filter({ hasText: folder })).toBeVisible();

    const { status } = await sharexPost(
      playwright,
      stack.E2E_BASE_URL,
      { name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) },
      { bearer: key },
    );
    expect(status).toBe(200);
    expect((await storedFile(db, bucket, name)).folderId).toBe(await folderIdOf(db, folder));
  });
});
