import { expect, type Page } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { snippet } from '../../../src/db/schema/files';
import type { TestDb } from '../fixtures/db';
import { clickUntil } from './hydration';

/** The id of the snippet a spec just created, found by its unique title. */
export async function snippetId(db: TestDb, title: string): Promise<string> {
  const [row] = await db
    .select({ id: snippet.id })
    .from(snippet)
    .where(and(eq(snippet.title, title), eq(snippet.isDeleted, false)));
  if (!row) throw new Error(`No snippet titled ${title}`);
  return row.id;
}

/**
 * Creates a snippet through the editor and waits until it is saved. Leaves it selected.
 * The editor autosaves 700 ms after the last edit, so "Saved" in the footer is the signal.
 */
export async function createPaste(page: Page, paste: { title: string; code: string; language?: string; isPublic?: boolean }) {
  await page.goto('/bin');
  const newButton = page.getByRole('button', { name: 'New' });
  const titleInput = page.getByRole('textbox', { name: 'Title' });
  await clickUntil(newButton, page.getByRole('button', { name: /Untitled snippet/ }).first());
  // An earlier snippet's editor is already on screen; typing waits until the new one has replaced it.
  await expect(titleInput).toHaveValue('Untitled snippet');
  await titleInput.fill(paste.title);
  await page.getByRole('textbox', { name: 'Code' }).fill(paste.code);
  if (paste.language) {
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: paste.language, exact: true }).click();
  }
  if (paste.isPublic) await page.getByRole('button', { name: 'Anyone with the link' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}
