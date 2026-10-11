import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type APIRequestContext, expect, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { folder } from '../../../src/db/schema/files';
import type { CorpusEntry } from '../fixtures/corpus';
import type { TestDb } from '../fixtures/db';
import { fileCards, scopeRow } from './files-screen';
import { clickUntil } from './hydration';

/** A file a spec uploaded for itself: its id, its unique title and the corpus entry it came from. */
export interface OwnFile {
  id: string;
  title: string;
  entry: CorpusEntry;
}

/** A title prefix no other test uses, so a spec can find its own files by searching for it. */
export const uniquePrefix = (label: string): string => `${label}-${randomBytes(3).toString('hex')}`;

/**
 * Uploads corpus files through `/api/upload/web` as the request context's user.
 * Each is titled `<prefix> <corpus name>`; `options` place them in a folder or make them private.
 */
export async function uploadOwnFiles(
  request: APIRequestContext,
  prefix: string,
  entries: readonly CorpusEntry[],
  options: { folderId?: string; private?: boolean; titleFor?: (entry: CorpusEntry) => string } = {},
): Promise<OwnFile[]> {
  const uploaded: OwnFile[] = [];
  for (const entry of entries) {
    const title = options.titleFor?.(entry) ?? `${prefix} ${entry.name}`;
    const response = await request.post('/api/upload/web', {
      multipart: {
        file: { name: entry.name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) },
        filename: title,
        ...(options.folderId ? { folderId: options.folderId } : {}),
        ...(options.private ? { private: 'true' } : {}),
      },
    });
    expect(response.status(), `upload of ${entry.name}`).toBe(200);
    const body = (await response.json()) as { file: { id: string } };
    uploaded.push({ id: body.file.id, title, entry });
  }
  return uploaded;
}

/** The card of a file on the Files screen (its `<article>` is named by the title). */
export const cardOf = (page: Page, title: string): Locator => page.getByRole('button', { name: title, exact: true });

/** Hovers a card (its actions show on hover) and opens its "More actions" menu. */
export async function openCardMenu(page: Page, title: string): Promise<void> {
  const card = cardOf(page, title);
  await card.hover();
  await card.getByRole('button', { name: 'More actions' }).click();
}

/**
 * Opens the Files screen and narrows it to the spec's own files by searching for
 * their unique prefix, then waits until exactly `count` cards are listed. Retries
 * the typing because the search box ignores input until the page hydrates.
 */
export async function openOwnFiles(page: Page, prefix: string, count: number): Promise<void> {
  await page.goto('/dashboard');
  const search = page.getByLabel('Search files by name');
  await expect(async () => {
    await search.fill(prefix);
    await expect(fileCards(page)).toHaveCount(count, { timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

/** Creates a folder through the sidebar's "New folder" field and waits for its row. */
export async function createFolderThroughSidebar(page: Page, name: string): Promise<void> {
  const field = page.getByLabel('Folder name');
  await clickUntil(page.getByRole('button', { name: 'New folder' }), field);
  await field.fill(name);
  await field.press('Enter');
  await expect(page.getByText(`Folder “${name}” created`)).toBeVisible();
  await expect(scopeRow(page, name)).toBeVisible();
}

/** The id of a folder, found by its (test-unique) name. */
export async function folderIdOf(db: TestDb, name: string): Promise<string> {
  const [row] = await db.select({ id: folder.id }).from(folder).where(eq(folder.name, name));
  if (!row) throw new Error(`No folder named ${name}`);
  return row.id;
}
