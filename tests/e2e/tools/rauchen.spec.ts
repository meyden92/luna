import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { uniquePrefix } from '../utils/own-files';

// The Rauchen tracker (/tools/rauchen), as this worker's own user. Entries accumulate per worker, so totals are
// asserted as changes from what the page showed first, and rows are found by a unique note.

/** The big number on a metric card, found by the card's title. */
const metric = (page: Page, title: string) =>
  page
    .locator('div[data-tone]')
    .filter({ has: page.getByText(title, { exact: true }) })
    .locator(':scope > div')
    .nth(1);

test('logged entries show up with their totals and survive a reload', async ({ workerPage: page }) => {
  const note = uniquePrefix('tracker-note');
  await page.goto('/tools/rauchen');
  await expect(page.getByRole('heading', { name: 'Jetzt erfassen' })).toBeVisible();
  const today = metric(page, 'Heute Rauchen');
  const smokedBefore = Number(await today.innerText());
  const nicoretteDetail = page.getByText(/ Nicorette heute$/);
  const nicotineBefore = Number((await nicoretteDetail.innerText()).split(' ')[0]);

  // The character counter only follows the field once React has hydrated it, so a click on the (inert before
  // that) button cannot be lost. Filling is repeatable; logging is not, which is why this is not `clickUntil`.
  await expect(async () => {
    await page.getByPlaceholder('Optionale Notiz zum Rauch-Eintrag').fill(note);
    await expect(page.getByText(`${note.length}/500`)).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole('button', { name: 'Rauchen', exact: true }).click();
  await expect(page.getByText('Rauchen eingetragen')).toBeVisible();
  await expect(today).toHaveText(String(smokedBefore + 1));
  await expect(page.getByRole('row').filter({ hasText: note })).toHaveCount(1);

  await page.getByRole('button', { name: 'Nicorette', exact: true }).click();
  await expect(page.getByText('Nicorette eingetragen')).toBeVisible();
  await expect(nicoretteDetail).toHaveText(`${nicotineBefore + 1} Nicorette heute`);
  await expect(today).toHaveText(String(smokedBefore + 1));

  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: note })).toHaveCount(1);
  await expect(metric(page, 'Heute Rauchen')).toHaveText(String(smokedBefore + 1));
  await expect(page.getByText(/ Nicorette heute$/)).toHaveText(`${nicotineBefore + 1} Nicorette heute`);

  // Deleting the entry takes it out of the list and the total, and that persists too.
  await page.getByRole('row').filter({ hasText: note }).getByRole('button', { name: 'Eintrag löschen' }).click();
  await page.getByRole('dialog', { name: 'Eintrag löschen' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('row').filter({ hasText: note })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: note })).toHaveCount(0);
  await expect(metric(page, 'Heute Rauchen')).toHaveText(String(smokedBefore));
});
