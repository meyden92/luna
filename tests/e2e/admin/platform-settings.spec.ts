import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { user } from '../../../src/db/schema/auth';
import { DEFAULT_STORAGE_PATH_TEMPLATES } from '../../../src/libs/storage-paths';
import { test } from '../fixtures/test';
import { fixtureUserId, workerRole } from '../fixtures/users';
import { SHAREX_MAX_UPLOAD_BYTES } from '../stack-env';
import { clickUntil } from '../utils/hydration';

// Settings → Storage and Settings → Limits apply to every User, so this file runs in the `instance-wide` project after
// the rest of the suite (playwright.config.ts), one test after another, and puts every value back.

test.describe.configure({ mode: 'serial' });

async function openSettings(adminPage: Page, tile: RegExp, title: string) {
  await adminPage.goto('/admin/settings');
  await adminPage.getByRole('link', { name: tile }).click();
  await expect(adminPage).toHaveTitle(title);
}

async function setAvatarPath(adminPage: Page, template: string) {
  await adminPage.goto('/admin/settings/storage');
  await adminPage.getByLabel('Avatars').fill(template);
  await clickUntil(adminPage.getByRole('button', { name: 'Save paths' }), adminPage.getByText('Storage settings saved'));
}

async function setAvatarLimit(adminPage: Page, mib: string) {
  await adminPage.goto('/admin/settings/limits');
  await adminPage.getByLabel('Maximum Avatar upload (MiB)').fill(mib);
  await clickUntil(adminPage.getByRole('button', { name: 'Save limits' }), adminPage.getByText('Limits saved'));
}

async function pickAvatar(page: Page, path: string) {
  await page.goto('/settings/profile');
  await expect(page).toHaveTitle('Profile | LunaShare');
  await expect(page.getByLabel('Display name')).not.toHaveValue('');
  await page.getByTestId('avatar-input').setInputFiles(path);
}

test('a new Avatar is stored under the Avatar path set in Settings → Storage', async ({
  adminPage,
  workerPage,
  corpus,
  bucket,
  db,
}, testInfo) => {
  const userId = await fixtureUserId(db, workerRole(testInfo.parallelIndex));

  await openSettings(adminPage, /^Storage /, 'Storage settings | LunaShare');
  const field = adminPage.getByLabel('Avatars');
  await expect(field).toHaveValue(DEFAULT_STORAGE_PATH_TEMPLATES.avatarPath);

  await field.fill('/avatars/{uuid}.webp');
  await expect(adminPage.getByText('The path must not start with "/".')).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Save paths' })).toBeDisabled();
  await field.fill('avatars/{user}.webp');
  await expect(adminPage.getByText('Unknown variable {user}.')).toBeVisible();

  try {
    await setAvatarPath(adminPage, 'zz-e2e-avatars/{yyyy}/{uuid}.webp');
    await adminPage.reload();
    await expect(field).toHaveValue('zz-e2e-avatars/{yyyy}/{uuid}.webp');

    await expect(async () => {
      await pickAvatar(workerPage, corpus.file('square-food.png').path);
      await expect(workerPage.getByText('Avatar updated')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
    expect(row?.image).toMatch(new RegExp(`^zz-e2e-avatars/${new Date().getUTCFullYear()}/[0-9a-f]{32}\\.webp$`));
    await bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: row!.image! }));

    await workerPage.getByRole('button', { name: 'Remove' }).click();
    await expect(workerPage.getByText('Avatar removed')).toBeVisible();
  } finally {
    await setAvatarPath(adminPage, DEFAULT_STORAGE_PATH_TEMPLATES.avatarPath);
  }
});

test('the Avatar upload limit set in Settings → Limits refuses a larger picture', async ({ adminPage, workerPage, corpus }) => {
  const picture = corpus.file('robot-illustration.png');
  expect(picture.size).toBeGreaterThan(1024 * 1024);

  await openSettings(adminPage, /^Limits /, 'Limits | LunaShare');
  await expect(adminPage.getByLabel('Maximum Avatar upload (MiB)')).toHaveValue('8');
  // The stack's own ShareX limit, which saving the form must keep.
  await expect(adminPage.getByLabel('Maximum ShareX upload (MiB)')).toHaveValue(String(SHAREX_MAX_UPLOAD_BYTES / (1024 * 1024)));

  try {
    await setAvatarLimit(adminPage, '1');
    await expect(async () => {
      await pickAvatar(workerPage, picture.path);
      await expect(workerPage.getByText('Image is larger than 1 MiB')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  } finally {
    await setAvatarLimit(adminPage, '8');
  }
});
