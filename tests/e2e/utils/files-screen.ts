import { expect, type Locator, type Page } from '@playwright/test';

/** Every file card on the Files screen, in the order the page lists them. */
export const fileCards = (page: Page): Locator => page.locator('article[role="button"]');

/** The titles of the loaded cards, in page order. */
export const cardTitles = (page: Page): Promise<string[]> =>
  fileCards(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label') ?? ''));

/** The date headings with the card titles under each, in page order. */
export const dateGroups = (page: Page): Promise<{ label: string; titles: string[] }[]> =>
  page.locator('section:has(h2)').evaluateAll((sections) =>
    sections.map((section) => ({
      label: section.querySelector('h2')?.textContent ?? '',
      titles: [...section.querySelectorAll('article[role="button"]')].map((card) => card.getAttribute('aria-label') ?? ''),
    })),
  );

/** "1 file" / "N files": the Files header's count and the date groups' meta. */
export const fileCount = (n: number): string => `${n} ${n === 1 ? 'file' : 'files'}`;

/** The page header's count line ("12 files", "3 files matching “x”"). */
export const countLine = (page: Page): Locator => page.getByText(/^\d+ files?( matching .*)?$/);

/** The "Folders" sidebar row for a Scope ("All files", "Not in a folder" or a folder name). */
export const scopeRow = (page: Page, name: string): Locator =>
  page.getByRole('complementary', { name: 'Folders' }).getByRole('button', { name: new RegExp(`^${name}`) });

/**
 * Scrolls the last card into view until `total` cards are loaded. Each scroll
 * triggers the next page of 30; fails if the list stops short.
 */
export async function loadAll(page: Page, total: number): Promise<void> {
  const cards = fileCards(page);
  await expect(async () => {
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(total, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * The order the page lists `titles` in when `groupOf` names each one's date
 * heading. Groups appear in the order their first file does and keep their
 * files together, whatever the sort, so a name or size order is regrouped.
 */
export function asListed<T extends { title: string }>(files: readonly T[], groupOf: (file: T) => string): string[] {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const key = groupOf(file);
    groups.set(key, [...(groups.get(key) ?? []), file.title]);
  }
  return [...groups.values()].flat();
}
