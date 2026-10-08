import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { user } from '../../../src/db/schema/auth';
import { file, folder } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { fixtureUser, QUOTA_USER_QUOTA_MIB } from '../fixtures/users';

// Proves the setup project left each fixture user in the state specs rely on.

test('the gallery user sees the whole seeded dataset', async ({ galleryPage, gallery }) => {
  await galleryPage.goto('/dashboard');

  await expect(galleryPage.getByRole('heading', { level: 1, name: 'All files' })).toBeVisible();
  await expect(galleryPage.getByText(`${gallery.files.length} files`, { exact: true })).toBeVisible();
});

test('the seeded rows match the exported dataset', async ({ db, gallery }) => {
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, fixtureUser('gallery').username));
  const rows = await db
    .select({ title: file.title, folder: folder.name, private: file.private, createdAt: file.createdAt, size: file.size })
    .from(file)
    .leftJoin(folder, eq(file.folderId, folder.id))
    .where(eq(file.ownerId, owner!.id));

  const expected = gallery.files
    .map((f) => ({ title: f.title, folder: f.folder, private: f.private, createdAt: f.createdAt, size: f.source.size }))
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  const actual = rows.map((row) => ({ ...row, size: Number(row.size) })).sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  expect(actual).toEqual(expected);
});

test('the empty user sees the empty Files screen', async ({ emptyPage }) => {
  await emptyPage.goto('/dashboard');

  await expect(emptyPage.getByText('0 files', { exact: true })).toBeVisible();
  await expect(emptyPage.getByText('This folder is empty')).toBeVisible();
});

test('the quota user has its small quota', async ({ quotaPage }) => {
  await quotaPage.goto('/settings/storage');

  await expect(quotaPage.getByText(`of ${QUOTA_USER_QUOTA_MIB} MB used`)).toBeVisible();
});

test('the worker user is signed in as its own user', async ({ workerPage }, testInfo) => {
  await workerPage.goto('/settings/profile');

  await expect(workerPage.getByLabel('Username')).toHaveValue(fixtureUser(`worker${testInfo.parallelIndex}`).username);
});
