import { readFileSync, writeFileSync } from 'node:fs';
import { type APIRequestContext, expect, type Page, test as setup } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { file } from '../../../src/db/schema/files';
import { createTestDb } from '../fixtures/db';
import {
  GALLERY_FOLDERS,
  GALLERY_SEED_PATH,
  GALLERY_UPLOADS,
  type GalleryFolder,
  type GalleryUpload,
  galleryDataset,
} from '../fixtures/gallery';
import { clientIpHeader, fixtureUserId, storageStatePath } from '../fixtures/users';
import { stackEnv } from '../stack-env';
import { clickUntil } from '../utils/hydration';

/**
 * Seeds the gallery user with `GALLERY_UPLOADS`, through the app wherever the
 * app offers a way: a Token from settings, folders from the Files sidebar,
 * ShareX uploads, the folder default and the card menu's "Make private". The
 * one direct write is backdating `file.created_at` to `galleryDataset`'s dates.
 */
setup('gallery user is seeded through the app', async ({ browser, playwright }) => {
  setup.setTimeout(6 * 60_000);
  const { E2E_BASE_URL, E2E_DATABASE_URL } = stackEnv();
  const context = await browser.newContext({ storageState: storageStatePath('gallery'), extraHTTPHeaders: clientIpHeader() });
  const page = await context.newPage();

  const token = await createToken(page);
  await createFolders(page);

  // ShareX has no per-upload folder; the token's folder default decides it.
  const sharex = await playwright.request.newContext({
    baseURL: E2E_BASE_URL,
    extraHTTPHeaders: { ...clientIpHeader(), Authorization: `Bearer ${token}` },
  });
  const pacer = new SharexPacer();
  await page.goto('/settings');
  for (const folder of [null, ...GALLERY_FOLDERS]) {
    await setUploadFolder(page, folder);
    await uploadTwoAtATime(
      sharex,
      pacer,
      GALLERY_UPLOADS.filter((upload) => upload.folder === folder),
    );
  }
  await sharex.dispose();

  await makePrivate(
    page,
    GALLERY_UPLOADS.filter((upload) => upload.private),
  );
  await context.close();

  // Backdate, then record the moment the dates were computed from.
  const { db, close } = createTestDb(E2E_DATABASE_URL);
  const ownerId = await fixtureUserId(db, 'gallery');
  const stored = await db.select({ title: file.title }).from(file).where(eq(file.ownerId, ownerId));
  expect(stored.map((row) => row.title).sort()).toEqual(GALLERY_UPLOADS.map((upload) => upload.title).sort());

  const seededAt = new Date();
  await db.transaction(async (tx) => {
    for (const seeded of galleryDataset(seededAt).files) {
      await tx
        .update(file)
        .set({ createdAt: seeded.createdAt })
        .where(and(eq(file.ownerId, ownerId), eq(file.title, seeded.title)));
    }
  });
  await close();
  writeFileSync(GALLERY_SEED_PATH, JSON.stringify({ seededAt: seededAt.toISOString() }));
});

/** Creates a Token under Settings → Upload tokens and reads the value it shows once. */
async function createToken(page: Page): Promise<string> {
  await page.goto('/settings');
  const create = page.getByRole('dialog', { name: 'New upload token' });
  await clickUntil(page.getByRole('button', { name: 'New token' }), create);
  await create.getByLabel('Name').fill('e2e seeding');
  await create.getByRole('button', { name: 'Create token' }).click();

  const reveal = page.getByRole('dialog', { name: 'Copy your token now' });
  // The raw key is the text right before the Copy button.
  const key = (await reveal.getByRole('button', { name: 'Copy' }).locator('xpath=preceding-sibling::span').textContent())?.trim();
  expect(key).toBeTruthy();
  await reveal.getByRole('button', { name: 'Done' }).click();
  return key!;
}

/** Creates `GALLERY_FOLDERS` with the Files sidebar's "New folder" field. */
async function createFolders(page: Page): Promise<void> {
  await page.goto('/dashboard');
  const sidebar = page.getByRole('complementary', { name: 'Folders' });
  const field = sidebar.getByRole('textbox', { name: 'Folder name' });
  for (const name of GALLERY_FOLDERS) {
    await clickUntil(sidebar.getByRole('button', { name: 'New folder' }), field);
    await field.fill(name);
    await field.press('Enter');
    await expect(page.getByText(`Folder “${name}” created`)).toBeVisible();
  }
}

/** Sets "Defaults for new uploads" → Folder on the settings page, which every token uploads into. */
async function setUploadFolder(page: Page, folder: GalleryFolder | null): Promise<void> {
  const label = folder ?? 'Not in a folder';
  const select = page.getByRole('combobox');
  const option = page.getByRole('option', { name: label });
  await clickUntil(select, option);
  await option.click();
  // The trigger shows the token's saved value (and a chevron) once the save and refetch are done.
  await expect(select).toHaveText(new RegExp(`^${label}`));
  await expect(select).toBeEnabled();
}

/**
 * Keeps ShareX uploads inside `uploadSharex`'s limit: a fixed window of 60
 * requests per user, starting at the first request after the previous window
 * ran out. The server stamps that start only after parsing the form and the
 * token, which under load lags the send by seconds, so the client dates its
 * window from the first request's response instead: always at or after the
 * server's stamp. The margin covers the clock gap between host and container.
 */
class SharexPacer {
  private static readonly MAX = 60;
  private static readonly WINDOW_MS = 60_000 + 2_000;
  private windowStart = 0;
  private count = 0;
  /** Set while the request that opens a window is in flight, so its start is not yet known. */
  private opening: Promise<void> | undefined;

  /** Resolves when a request may go out; call the returned function once its response is back. */
  async acquire(): Promise<() => void> {
    for (;;) {
      // Re-checked after waking: the lanes must not both see a window as expired and both open it.
      if (this.opening) {
        await this.opening;
        continue;
      }
      const now = Date.now();
      if (now >= this.windowStart + SharexPacer.WINDOW_MS) {
        this.count = 1;
        let opened!: () => void;
        this.opening = new Promise((resolve) => {
          opened = resolve;
        });
        return () => {
          this.windowStart = Date.now();
          this.opening = undefined;
          opened();
        };
      }
      if (this.count < SharexPacer.MAX) {
        this.count += 1;
        return () => {};
      }
      await new Promise((resolve) => setTimeout(resolve, this.windowStart + SharexPacer.WINDOW_MS - now));
    }
  }
}

/** Uploads through `/api/upload/sharex`, never more than `SHAREX_UPLOAD_CONCURRENCY` (2) at once. */
async function uploadTwoAtATime(request: APIRequestContext, pacer: SharexPacer, uploads: GalleryUpload[]): Promise<void> {
  const queue = [...uploads];
  const lane = async () => {
    for (let upload = queue.shift(); upload; upload = queue.shift()) {
      const answered = await pacer.acquire();
      const response = await request.post('/api/upload/sharex', {
        multipart: { file: { name: upload.title, mimeType: upload.source.mimeType, buffer: readFileSync(upload.source.path) } },
      });
      answered();
      expect(response.status(), `${upload.title}: ${await response.text()}`).toBe(200);
    }
  };
  await Promise.all([lane(), lane()]);
}

/** "Make private" from each file's card menu on the Files screen. */
async function makePrivate(page: Page, uploads: GalleryUpload[]): Promise<void> {
  await page.goto('/dashboard');
  const search = page.getByLabel('Search files by name');
  for (const upload of uploads) {
    await search.fill(upload.title);
    const card = page.getByRole('button', { name: upload.title, exact: true });
    const makePrivateItem = page.getByRole('menuitem', { name: 'Make private' });
    await clickUntil(card.getByRole('button', { name: 'More actions' }), makePrivateItem);
    await makePrivateItem.click();
    await expect(card.getByTitle('Private')).toBeVisible();
  }
}
