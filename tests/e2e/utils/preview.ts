import type { Locator, Page } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { user } from '../../../src/db/schema/auth';
import { file } from '../../../src/db/schema/files';
import type { TestDb } from '../fixtures/db';
import { fixtureUser } from '../fixtures/users';

/** The Preview overlay of the file with this title (its dialog is named by the file). */
export const previewOf = (page: Page, title: string): Locator => page.getByRole('dialog', { name: title, exact: true });

/** The Preview's "N / total" counter. */
export const previewCounter = (page: Page): Locator => page.getByText(/^\d+ \/ \d+…?$/);

/** Title -> id for every file the seeded gallery user holds. */
export async function galleryFileIds(db: TestDb): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: file.id, title: file.title })
    .from(file)
    .innerJoin(user, eq(file.ownerId, user.id))
    .where(and(eq(user.username, fixtureUser('gallery').username), eq(file.isDeleted, false)));
  return new Map(rows.map((row) => [row.title, row.id]));
}
