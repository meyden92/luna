import { expect, type Page } from '@playwright/test';
import { formatSize } from '../../../src/libs/utils';
import { test } from '../fixtures/test';
import { QUOTA_USER_QUOTA_MIB } from '../fixtures/users';

// Settings → Storage: the figures a user reads must match what is stored. The gallery user's
// dataset is fixed, so its totals are known exactly; the quota user shows its allowance.

/** The "<used>" and "of <quota> used" texts of the big number. */
async function usageFigures(page: Page): Promise<{ used: string; quota: string }> {
  const figure = page.getByRole('group', { name: 'Storage usage' });
  await expect(figure).toBeVisible();
  const [, used, quota] = (await figure.innerText()).trim().match(/^([\s\S]+?)\s*of (.+) used$/)!;
  return { used: used!, quota: quota! };
}

const KINDS = { Images: 'image', Video: 'video', Audio: 'audio' } as const;

test('the gallery user sees the dataset total and the size of each kind', async ({ galleryPage, gallery }) => {
  await galleryPage.goto('/settings/storage');
  await expect(galleryPage).toHaveTitle('Storage | LunaShare');

  await expect.poll(async () => (await usageFigures(galleryPage)).used).toBe(formatSize(gallery.totalBytes, { trim: true }));

  // The Files screen's own kind of each file (a `.ts` declared as video/mp2t is stored as text).
  const bytesOf = (kind: string | null) =>
    gallery.files
      .filter((f) => (kind ? f.source.kind === kind : !['image', 'video', 'audio'].includes(f.source.kind)))
      .reduce((sum, f) => sum + f.source.size, 0);
  for (const [label, prefix] of Object.entries(KINDS)) {
    await expect(galleryPage.getByText(new RegExp(`^${label}`))).toContainText(formatSize(bytesOf(prefix), { trim: true }));
  }
  await expect(galleryPage.getByText(/^Other/)).toContainText(formatSize(bytesOf(null), { trim: true }));
});

test('the largest files are listed biggest first', async ({ galleryPage, gallery }) => {
  await galleryPage.goto('/settings/storage');
  const panel = galleryPage.getByRole('table');
  await expect(panel.getByRole('row')).toHaveCount(6); // header + the top five

  const sizeOf = new Map(gallery.files.map((f) => [f.title, f.source.size]));
  const expected = gallery.files.map((f) => f.source.size).sort((a, b) => b - a);
  const rows = panel.getByRole('row');
  for (let i = 1; i <= 5; i++) {
    const cells = rows.nth(i).getByRole('cell');
    // Copies of one file share a size, so assert the size and that the title is a dataset file of it.
    await expect(cells.nth(1)).toHaveText(formatSize(expected[i - 1]));
    const title = (await cells.nth(0).textContent())!.trim();
    expect(sizeOf.get(title), `${title} is a gallery file of that size`).toBe(expected[i - 1]);
  }
});

test('"Show" opens the file in the Preview', async ({ galleryPage }) => {
  await galleryPage.goto('/settings/storage');
  const first = galleryPage.getByRole('table').getByRole('row').nth(1);
  const title = (await first.getByRole('cell').nth(0).textContent())!.trim();

  await first.getByRole('link', { name: 'Show' }).click();

  await expect(galleryPage).toHaveURL(/\/dashboard\?file=/);
  await expect(galleryPage.getByRole('dialog', { name: title, exact: true })).toBeVisible();
});

test('the quota user sees its allowance, and the sidebar meter agrees', async ({ quotaPage }) => {
  await quotaPage.goto('/settings/storage');
  // The figures render as "0 B of 0 B" until the usage query answers.
  await expect.poll(async () => (await usageFigures(quotaPage)).quota).toBe(`${QUOTA_USER_QUOTA_MIB} MB`);

  await quotaPage.goto('/dashboard');
  const meter = quotaPage.getByRole('progressbar', { name: 'Storage used' });
  await expect(meter).toHaveAttribute('aria-valuenow', /^\d+$/);
  await expect(quotaPage.getByText(`of ${QUOTA_USER_QUOTA_MIB} MB`)).toBeVisible();
});

test('the empty user has nothing to show', async ({ emptyPage }) => {
  await emptyPage.goto('/settings/storage');

  await expect.poll(async () => (await usageFigures(emptyPage)).used).toBe('0 B');
  await expect(emptyPage.getByText('No files yet.')).toBeVisible();
});
