import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { expect } from '@playwright/test';
import { count, eq } from 'drizzle-orm';
import { file } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { fixtureUser } from '../fixtures/users';
import { userIdOf } from '../utils/admin-users';
import { clickUntil } from '../utils/hydration';
import { servedFile } from '../utils/served-files';
import { bucketKeysContaining } from '../utils/uploads';

// The Manual Operations tiles of /admin/tasks. They act on the whole installation, so each test only reads
// shared data or touches objects it created itself.

test('Sync Files analyses the bucket and reports its result without changing the gallery dataset', async ({
  adminPage,
  bucket,
  db,
  gallery,
}) => {
  const galleryId = await userIdOf(db, fixtureUser('gallery').email);
  const rowsOf = async () => (await db.select({ n: count() }).from(file).where(eq(file.ownerId, galleryId)))[0]!.n;
  // Renditions of the gallery files are written lazily by the serving specs, so they are not part of the dataset.
  const datasetKeys = async () => (await bucketKeysContaining(bucket, galleryId, '')).filter((key) => !key.includes('/renditions/'));
  const objectsBefore = await datasetKeys();
  const rowsBefore = await rowsOf();

  await adminPage.goto('/admin/tasks');
  await adminPage.getByRole('link', { name: /Sync Files/ }).click();
  await expect(adminPage).toHaveTitle('Sync Files | LunaShare');
  await expect(adminPage.getByText('Ready for Analysis')).toBeVisible();

  // Other specs upload and delete while this runs, so the counts are only bounded below.
  const run = adminPage.getByRole('button', { name: 'Run Sync Analysis' });
  await clickUntil(run, adminPage.getByText('Synchronization Statistics'));
  await expect(adminPage.getByText('Sync comparison completed successfully')).toBeVisible();
  const tile = (label: string) => adminPage.getByRole('group', { name: label, exact: true }).getByText(/^\d+$/);
  expect(Number(await tile('Database Files').innerText())).toBeGreaterThanOrEqual(gallery.files.length);
  expect(Number(await tile('S3 Files').innerText())).toBeGreaterThanOrEqual(gallery.files.length);
  expect(Number(await tile('Synced Files').innerText())).toBeGreaterThanOrEqual(gallery.files.length);
  await expect(adminPage.getByText('Synchronization Rate')).toBeVisible();

  expect(await rowsOf()).toBe(rowsBefore);
  expect(await datasetKeys()).toEqual(objectsBefore);
});

test('Delete Cache purges the generative cache and leaves renditions serving', async ({ adminPage, bucket, db, gallery, request }) => {
  const key = `cache/e2e-${Date.now()}.bin`;
  await bucket.client.send(
    new PutObjectCommand({ Bucket: bucket.name, Key: key, Body: 'cached', ContentType: 'application/octet-stream' }),
  );
  const image = await servedFile(gallery, db, 'landscape-photo.jpg', { private: false });
  const rendition = () => request.get(`/cdn/${image.id}/w=200,fmt=png`);
  expect((await rendition()).status()).toBe(200);

  await adminPage.goto('/admin/tasks');
  await adminPage.getByRole('link', { name: /Delete Cache/ }).click();
  await expect(adminPage).toHaveTitle('Delete Cache | LunaShare');
  const purge = adminPage.getByRole('button', { name: 'Purge All Cache & History' });
  await clickUntil(purge, adminPage.getByRole('dialog', { name: 'Purge Cache & History?' }));
  const dialog = adminPage.getByRole('dialog', { name: 'Purge Cache & History?' });
  await expect(dialog).toContainText('This will delete ALL cached images and ALL template generation history.');

  // Cancel keeps the object.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: key }));

  await purge.click();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(adminPage.getByText(/Purge complete! Deleted [1-9]\d* files, \d+ cache records, and \d+ history records\./)).toBeVisible();
  await expect(bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: key }))).rejects.toMatchObject({ name: 'NotFound' });
  expect((await rendition()).status()).toBe(200);
});

test('Test Upload is a placeholder page', async ({ adminPage }) => {
  await adminPage.goto('/admin/tasks');
  await adminPage.getByRole('link', { name: /Test Upload/ }).click();

  await expect(adminPage).toHaveTitle('Test Upload | LunaShare');
  await expect(adminPage.getByRole('heading', { name: 'Test Upload Page' })).toBeVisible();
  await expect(adminPage.getByText('This is a placeholder for the test upload functionality.')).toBeVisible();
});
