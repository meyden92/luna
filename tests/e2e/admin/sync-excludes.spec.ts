import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { clickUntil } from '../utils/hydration';
import { uniquePrefix } from '../utils/own-files';

// The pattern this test adds only matches its own object, so the Sync Files runs of other specs see no difference.

async function runSyncAnalysis(adminPage: Page) {
  await adminPage.goto('/admin/tasks/sync-files');
  await clickUntil(adminPage.getByRole('button', { name: 'Run Sync Analysis' }), adminPage.getByText('Synchronization Statistics'));
}

test('a path excluded under Settings drops out of the Sync Files analysis', async ({ adminPage, bucket }) => {
  const prefix = uniquePrefix('zz-sync-exclude');
  const key = `${prefix}/orphan.txt`;
  const pattern = `${prefix}/*`;
  await bucket.client.send(new PutObjectCommand({ Bucket: bucket.name, Key: key, Body: 'orphan', ContentType: 'text/plain' }));

  try {
    await runSyncAnalysis(adminPage);
    await expect(adminPage.getByText(key, { exact: true })).toBeVisible();

    await adminPage.goto('/admin');
    await adminPage.getByRole('link', { name: /^Settings Everything adjustable/ }).click();
    await expect(adminPage).toHaveTitle('Settings | LunaShare');
    await adminPage.getByRole('link', { name: /Sync excluded paths/ }).click();
    await expect(adminPage).toHaveTitle('Sync excluded paths | LunaShare');

    const list = adminPage.getByRole('list', { name: 'Excluded paths' });
    for (const seeded of ['cache/*', 'templates/*', '*/edit-image/*']) {
      await expect(list.getByText(seeded, { exact: true })).toBeVisible();
    }

    const field = adminPage.getByLabel('New pattern');
    await field.fill(pattern);
    await clickUntil(adminPage.getByRole('button', { name: 'Exclude' }), list.getByText(pattern, { exact: true }));

    await runSyncAnalysis(adminPage);
    await expect(adminPage.getByText('Sync comparison completed successfully')).toBeVisible();
    await expect(adminPage.getByText(key, { exact: true })).toHaveCount(0);

    await adminPage.goto('/admin/settings/sync');
    await clickUntil(adminPage.getByRole('button', { name: `Remove ${pattern}` }), adminPage.getByText('Path no longer excluded'));
    await expect(list.getByText(pattern, { exact: true })).toHaveCount(0);
  } finally {
    await bucket.client.send(new DeleteObjectCommand({ Bucket: bucket.name, Key: key }));
  }
});
