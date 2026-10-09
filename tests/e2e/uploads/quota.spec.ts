import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { user } from '../../../src/db/schema/auth';
import { file } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { fixtureUser, QUOTA_USER_QUOTA_MIB } from '../fixtures/users';
import { fileCards } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import { openCardMenu, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';
import { bucketKeysContaining } from '../utils/uploads';

// The quota user has QUOTA_USER_QUOTA_MIB (4 MiB). Uploads that fit succeed; the one that would
// go over is refused with the STORAGE_QUOTA_EXCEEDED payload and the quota message, and nothing
// of it is stored. One test, because the steps share the user's running total; it deletes what
// it uploaded so the quota user is empty again for specs that read its usage.

const QUOTA_BYTES = QUOTA_USER_QUOTA_MIB * 1024 * 1024;

async function deleteOwnFiles(page: Page, prefix: string, titles: string[]): Promise<void> {
  await openOwnFiles(page, prefix, titles.length);
  for (const title of titles) {
    await openCardMenu(page, title);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog', { name: 'Delete this file?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('File deleted').first()).toBeVisible();
    await expect(fileCards(page)).toHaveCount(titles.length - titles.indexOf(title) - 1);
  }
}

test('uploads that fit succeed, the one over the quota is refused and nothing of it is stored', async ({
  quotaPage,
  quotaRequest,
  corpus,
  db,
  bucket,
}) => {
  const prefix = uniquePrefix('quota');
  const robot = corpus.file('robot-illustration.png');
  const landscape = corpus.file('landscape-photo.jpg');
  const tooBig = corpus.file('square-food.png');
  const tooBigTitle = `${prefix} refused ${tooBig.name}`;
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.username, fixtureUser('quota').username));

  const uploaded: string[] = [];
  try {
    // One through the sheet ...
    const uiTitle = `${prefix} sheet ${robot.name}`;
    await quotaPage.goto('/dashboard');
    await clickUntil(
      quotaPage.getByRole('button', { name: 'Upload', exact: true }).first(),
      quotaPage.getByRole('heading', { name: 'Upload files' }),
    );
    await quotaPage
      .locator('input[type="file"]')
      .setInputFiles({ name: uiTitle, mimeType: robot.mimeType, buffer: readFileSync(robot.path) });
    await quotaPage.getByRole('button', { name: 'Upload 1 file' }).click();
    await expect(quotaPage.getByText(/^Uploaded/)).toBeVisible();
    uploaded.push(uiTitle);

    // ... and the rest through the API, up to 3 911 259 of 4 194 304 bytes.
    let n = 0;
    const more = await uploadOwnFiles(quotaRequest, prefix, [robot, robot, landscape], {
      titleFor: (entry) => `${prefix} api${++n} ${entry.name}`,
    });
    uploaded.push(...more.map((item) => item.title));
    const used = robot.size * 3 + landscape.size;
    expect(used).toBeLessThan(QUOTA_BYTES);
    expect(used + tooBig.size).toBeGreaterThan(QUOTA_BYTES);

    // The API refuses with the full payload.
    const refused = await quotaRequest.post('/api/upload/web', {
      multipart: {
        file: { name: tooBig.name, mimeType: tooBig.mimeType, buffer: readFileSync(tooBig.path) },
        filename: tooBigTitle,
      },
    });
    expect(refused.status()).toBe(413);
    expect(await refused.json()).toEqual({
      error: 'Storage quota exceeded. 3.73 MB of 4 MB used; this upload needs 545.6 KB. Ask an admin to increase your quota.',
      code: 'STORAGE_QUOTA_EXCEEDED',
      usedBytes: used,
      quotaBytes: QUOTA_BYTES,
      remainingBytes: QUOTA_BYTES - used,
      attemptedBytes: tooBig.size,
    });

    // The sheet shows the same message and keeps the file queued.
    await quotaPage.goto('/dashboard');
    await clickUntil(
      quotaPage.getByRole('button', { name: 'Upload', exact: true }).first(),
      quotaPage.getByRole('heading', { name: 'Upload files' }),
    );
    await quotaPage
      .locator('input[type="file"]')
      .setInputFiles({ name: tooBigTitle, mimeType: tooBig.mimeType, buffer: readFileSync(tooBig.path) });
    await quotaPage.getByRole('button', { name: 'Upload 1 file' }).click();
    await expect(
      quotaPage.getByText(
        'Upload failed. Storage quota exceeded. 3.73 MB of 4 MB used; this upload needs 545.6 KB. Ask an admin to increase your quota.',
      ),
    ).toBeVisible();
    await expect(quotaPage.getByRole('dialog', { name: 'Upload files' }).getByText(tooBigTitle, { exact: true })).toBeVisible();

    // Nothing was stored for it: no row, no object, no usage.
    expect(await db.select().from(file).where(eq(file.title, tooBigTitle))).toHaveLength(0);
    expect(await bucketKeysContaining(bucket, owner!.id, tooBigTitle)).toEqual([]);
    const rows = await db.select({ size: file.size }).from(file).where(eq(file.ownerId, owner!.id));
    expect(rows.reduce((sum, row) => sum + row.size, 0)).toBe(used);
  } finally {
    await deleteOwnFiles(quotaPage, prefix, uploaded);
  }
});
