import { createHash, randomBytes } from 'node:crypto';
import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { file } from '../../../src/db/schema/files';
import type { TestDb } from '../fixtures/db';
import { test } from '../fixtures/test';
import { uniquePrefix } from '../utils/own-files';

// The denylist only ever holds hashes of images made inside these tests, so no other spec's upload can match.
// The tests run in order: the last one rescans every stored file.
test.describe.configure({ mode: 'serial' });

/** A 32x32 PNG of random pixels: its own sha256, md5 and pHash. */
async function noisePng(): Promise<Buffer> {
  return sharp(randomBytes(32 * 32 * 3), { raw: { width: 32, height: 32, channels: 3 } })
    .png()
    .toBuffer();
}

/** An 8x8 checkerboard of `cell`-pixel squares; `flipped` cells (row, column) are inverted. */
async function checkerboardPng(cell: number, flipped: [number, number][] = []): Promise<Buffer> {
  const size = cell * 8;
  const pixels = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / cell);
      const column = Math.floor(x / cell);
      const flip = flipped.some(([r, c]) => r === row && c === column);
      pixels[y * size + x] = (row + column + (flip ? 1 : 0)) % 2 === 0 ? 255 : 0;
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

/** The gate's perceptual hash: 8x8 grayscale, each pixel at or above the mean is 1 (see hash-gate.ts). */
async function averageHash(image: Buffer | string): Promise<string> {
  const { data } = await sharp(image).resize(8, 8, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
  return Array.from(data, (value) => (value >= mean ? '1' : '0')).join('');
}

const distance = (a: string, b: string): number => [...a].filter((bit, index) => bit !== b[index]).length;

const digest = (algorithm: 'sha256' | 'md5', bytes: Buffer): string => createHash(algorithm).update(bytes).digest('hex');

/** The stored row of a file the worker uploaded, found by its unique title. */
async function storedRow(db: TestDb, title: string) {
  const [row] = await db
    .select({ id: file.id, private: file.private, moderationStatus: file.moderationStatus, isDeleted: file.isDeleted })
    .from(file)
    .where(eq(file.title, title));
  if (!row) throw new Error(`No file titled ${title}`);
  return row;
}

/** Posts `bytes` as a web upload titled `title` and returns the raw response. */
function upload(request: APIRequestContext, title: string, bytes: Buffer) {
  return request.post('/api/upload/web', {
    multipart: { file: { name: 'image.png', mimeType: 'image/png', buffer: bytes }, filename: title },
  });
}

/** Adds one hash through the "Add Denylist Hash" card. Retries the fill because the card ignores input before hydration. */
async function addDenylistEntry(page: Page, type: 'SHA-256' | 'MD5' | 'pHash', hash: string): Promise<void> {
  await page.goto('/admin/moderation');
  const toast = page.getByText('Denylist entry added');
  await expect(async () => {
    if (type !== 'SHA-256') {
      await page.getByRole('combobox', { name: 'Hash type' }).click();
      await page.getByRole('option', { name: type }).click();
    }
    await page.getByPlaceholder('Hash value').fill(hash);
    await page.getByRole('button', { name: 'Add entry' }).click();
    await expect(toast).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole('cell', { name: hash, exact: true })).toBeVisible();
}

test('a denylisted SHA-256 rejects the upload, quarantines the file and the case can be released', async ({
  adminPage,
  db,
  workerRequest,
}) => {
  const image = await noisePng();
  const title = `${uniquePrefix('mod-sha')} noise.png`;
  await addDenylistEntry(adminPage, 'SHA-256', digest('sha256', image));

  const response = await upload(workerRequest, title, image);
  expect(response.status()).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'MODERATION_REJECTED' });

  const stored = await storedRow(db, title);
  expect(stored).toMatchObject({ private: true, moderationStatus: 'quarantined' });
  expect((await workerRequest.get(`/api/d/${stored.id}`)).status()).toBe(404);

  await adminPage.goto('/admin/moderation');
  const row = adminPage.getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('sha256');
  await expect(row.getByRole('cell', { name: 'quarantined', exact: true })).toBeVisible();

  await row.getByRole('button', { name: 'Release' }).click();
  await expect(adminPage.getByText('Case updated')).toBeVisible();
  await expect(row.getByRole('cell', { name: 'released', exact: true })).toBeVisible();
  expect(await storedRow(db, title)).toMatchObject({ moderationStatus: 'clear', isDeleted: false });
});

test('an MD5 imported in bulk rejects the upload and confirming the case deletes the file', async ({ adminPage, db, workerRequest }) => {
  const image = await noisePng();
  const title = `${uniquePrefix('mod-md5')} noise.png`;
  await adminPage.goto('/admin/moderation');
  const imported = adminPage.getByText('Imported 1 denylist entry');
  await expect(async () => {
    await adminPage.getByPlaceholder(/^sha256,hash,notes/).fill(`md5,${digest('md5', image)},bulk test`);
    await adminPage.getByRole('button', { name: 'Import hashes' }).click();
    await expect(imported).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });

  expect((await upload(workerRequest, title, image)).status()).toBe(403);

  await adminPage.goto('/admin/moderation');
  const row = adminPage.getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('md5');
  await row.getByRole('button', { name: 'Confirm' }).click();
  await expect(row.getByRole('cell', { name: 'confirmed', exact: true })).toBeVisible();
  expect(await storedRow(db, title)).toMatchObject({ moderationStatus: 'confirmed', isDeleted: true });
});

test('a pHash entry rejects a near-duplicate image with its distance and escalating keeps the file quarantined', async ({
  adminPage,
  corpus,
  db,
  workerRequest,
}) => {
  const pattern = await averageHash(await checkerboardPng(8));
  // The entry blocks every image within 8 bits of the pattern for the rest of the run, so no corpus image may be that close.
  for (const entry of corpus.byKind('image')) {
    expect(distance(pattern, await averageHash(entry.path)), `${entry.name} stays clear of the checkerboard`).toBeGreaterThan(8);
  }
  await addDenylistEntry(adminPage, 'pHash', pattern);

  const nearby = await checkerboardPng(12, [
    [0, 0],
    [3, 4],
  ]);
  const expectedDistance = distance(pattern, await averageHash(nearby));
  expect(expectedDistance).toBeGreaterThan(0);
  expect(expectedDistance).toBeLessThanOrEqual(8);

  const title = `${uniquePrefix('mod-phash')} checkerboard.png`;
  const response = await upload(workerRequest, title, nearby);
  expect(response.status()).toBe(403);

  await adminPage.goto('/admin/moderation');
  const row = adminPage.getByRole('row').filter({ hasText: title });
  await expect(row).toContainText(`phash · d=${expectedDistance}`);
  await row.getByRole('button', { name: 'Escalate' }).click();
  await expect(row.getByRole('cell', { name: 'escalated', exact: true })).toBeVisible();
  expect(await storedRow(db, title)).toMatchObject({ private: true, moderationStatus: 'quarantined' });
});

test('rescanning quarantines a stored file whose hash was denylisted after the upload', async ({ adminPage, db, workerRequest }) => {
  const image = await noisePng();
  const title = `${uniquePrefix('mod-rescan')} noise.png`;
  expect((await upload(workerRequest, title, image)).status()).toBe(200);
  expect(await storedRow(db, title)).toMatchObject({ moderationStatus: 'clear' });

  await addDenylistEntry(adminPage, 'SHA-256', digest('sha256', image));
  await adminPage.getByRole('button', { name: 'Rescan files' }).click();
  await expect(adminPage.getByText(/^Rescanned \d+ file\(s\), quarantined [1-9]\d*$/)).toBeVisible();

  const row = adminPage.getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('sha256');
  await expect(row.getByRole('cell', { name: 'quarantined', exact: true })).toBeVisible();
  expect(await storedRow(db, title)).toMatchObject({ private: true, moderationStatus: 'quarantined' });
});
