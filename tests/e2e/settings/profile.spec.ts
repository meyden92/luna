import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { fixtureUser, fixtureUserId, workerRole } from '../fixtures/users';
import { scopeRow } from '../utils/files-screen';
import { uniquePrefix, uploadOwnFiles } from '../utils/own-files';

// Settings → Profile and the public profile page it feeds. Specs run as the worker user and put
// the profile back as they found it, so the next test on the worker starts from the same state.

/** Saves the profile form's pending changes and waits for the confirmation. */
async function saveProfile(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();
  await expect(page.getByText('You have unsaved changes')).toBeHidden();
}

/** Opens Settings → Profile once its form has hydrated (the display name field is controlled). */
async function openProfileSettings(page: Page): Promise<void> {
  await page.goto('/settings/profile');
  await expect(page).toHaveTitle('Profile | LunaShare');
  await expect(page.getByLabel('Display name')).not.toHaveValue('');
}

const accountName = (page: Page) => page.getByRole('button', { name: 'Account' });

test('a new display name, bio and description show in the navigation and on the public profile', async ({
  workerPage,
  emptyPage,
  db,
}, testInfo) => {
  const me = fixtureUser(workerRole(testInfo.parallelIndex));
  const id = await fixtureUserId(db, me.role);
  const tag = uniquePrefix('profile');
  const name = `Renamed ${tag}`;
  const bio = `Bio ${tag}`;
  const description = `Description ${tag}`;

  await openProfileSettings(workerPage);
  await expect(workerPage.getByLabel('Username')).toHaveValue(me.username);
  await expect(workerPage.getByLabel('Username')).toHaveJSProperty('readOnly', true);
  try {
    await workerPage.getByLabel('Display name').fill(name);
    await workerPage.getByLabel('Bio').fill(bio);
    await workerPage.getByLabel('Description').fill(description);
    await saveProfile(workerPage);

    // The navigation's account menu greets the new name.
    await accountName(workerPage).click();
    await expect(workerPage.getByText(name, { exact: true })).toBeVisible();

    // Another user's view of the public profile.
    await emptyPage.goto(`/profile/${id}`);
    await expect(emptyPage.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(emptyPage.getByText(bio, { exact: true })).toBeVisible();
    await expect(emptyPage.getByText(description, { exact: true })).toBeVisible();
  } finally {
    await openProfileSettings(workerPage);
    await workerPage.getByLabel('Display name').fill(me.name);
    await workerPage.getByLabel('Bio').fill('');
    await workerPage.getByLabel('Description').fill('');
    await saveProfile(workerPage);
  }

  await emptyPage.reload();
  await expect(emptyPage.getByRole('heading', { level: 1, name: me.name })).toBeVisible();
  await expect(emptyPage.getByText('This user has not set a bio yet.')).toBeVisible();
  await expect(emptyPage.getByText('This user has not set a description yet.')).toBeVisible();
});

test('Discard drops unsaved edits', async ({ workerPage }, testInfo) => {
  const me = fixtureUser(workerRole(testInfo.parallelIndex));
  await openProfileSettings(workerPage);
  const field = workerPage.getByLabel('Display name');

  await field.fill('Never saved');
  await expect(workerPage.getByText('You have unsaved changes')).toBeVisible();
  await workerPage.getByRole('button', { name: 'Discard' }).click();

  await expect(field).toHaveValue(me.name);
  await expect(workerPage.getByText('You have unsaved changes')).toBeHidden();
});

test('a blank display name cannot be saved', async ({ workerPage }) => {
  await openProfileSettings(workerPage);

  await workerPage.getByLabel('Display name').fill('   ');

  await expect(workerPage.getByRole('button', { name: 'Save changes' })).toBeDisabled();
});

test('switching the public profile off hides it from others but not from its owner', async ({ workerPage, emptyPage, db }, testInfo) => {
  const me = fixtureUser(workerRole(testInfo.parallelIndex));
  const id = await fixtureUserId(db, me.role);
  const publicSwitch = () => workerPage.getByRole('switch', { name: 'Public profile' });

  await openProfileSettings(workerPage);
  await expect(publicSwitch()).toBeChecked();
  try {
    await publicSwitch().click();
    await saveProfile(workerPage);

    const hidden = await emptyPage.goto(`/profile/${id}`);
    expect(hidden!.status()).toBe(404);
    await expect(emptyPage.getByRole('heading', { level: 1, name: me.name })).toHaveCount(0);

    await workerPage.goto(`/profile/${id}`);
    await expect(workerPage.getByRole('heading', { level: 1, name: me.name })).toBeVisible();
  } finally {
    await openProfileSettings(workerPage);
    if (!(await publicSwitch().isChecked())) {
      await publicSwitch().click();
      await saveProfile(workerPage);
    }
  }

  await emptyPage.reload();
  await expect(emptyPage.getByRole('heading', { level: 1, name: me.name })).toBeVisible();
});

test('the public profile counts public files only, and its page never mentions a private file', async ({
  workerRequest,
  emptyPage,
  corpus,
  db,
}, testInfo) => {
  const me = fixtureUser(workerRole(testInfo.parallelIndex));
  const id = await fixtureUserId(db, me.role);
  const prefix = uniquePrefix('profile-count');
  const uploads = emptyPage.getByText(/^[\d,]+ Uploads$/);
  const countOf = async () => Number((await uploads.textContent())!.replace(/\D/g, ''));

  await emptyPage.goto(`/profile/${id}`);
  const before = await countOf();

  const [publicFile] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('notes.txt')]);
  await emptyPage.reload();
  expect(await countOf()).toBe(before + 1);

  const [privateFile] = await uploadOwnFiles(workerRequest, `${prefix}-secret`, [corpus.file('readme.md')], { private: true });
  const response = await emptyPage.goto(`/profile/${id}`);
  expect(await countOf()).toBe(before + 1);
  const html = await response!.text();
  expect(html).not.toContain(privateFile!.title);
  expect(html).not.toContain(publicFile!.title);
});

test('an Avatar shows in the navigation and on the public profile, is not a file, and can be removed', async ({
  workerPage,
  emptyPage,
  corpus,
  bucket,
  db,
}, testInfo) => {
  const me = fixtureUser(workerRole(testInfo.parallelIndex));
  const id = await fixtureUserId(db, me.role);
  const picture = corpus.file('square-food.png');
  const navAvatar = workerPage.getByRole('img', { name: me.name });
  const usedFigure = async () => {
    await workerPage.goto('/settings/storage');
    const label = workerPage.getByText(/^of .+ used$/);
    // Until the usage query answers the page shows a placeholder: 0 B used of 0 B.
    await expect(label).not.toHaveText('of 0 B used');
    await expect(label).toBeVisible();
    return label.locator('xpath=preceding-sibling::span').textContent();
  };
  const filesInAllFiles = async () => {
    await workerPage.goto('/dashboard');
    return scopeRow(workerPage, 'All files').getAttribute('aria-label');
  };

  const storageBefore = await usedFigure();
  const filesBefore = await filesInAllFiles();

  await openProfileSettings(workerPage);
  await expect(workerPage.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  await expect(async () => {
    await workerPage.getByTestId('avatar-input').setInputFiles(picture.path);
    await expect(workerPage.getByText('Avatar updated')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  // The navigation's avatar loads the stored picture: a 512x512 WebP.
  await expect(navAvatar).toBeVisible();
  await expect(navAvatar).toHaveJSProperty('naturalWidth', 512);
  const src = (await navAvatar.getAttribute('src'))!;
  const key = /static\/avatar\/[0-9a-f]+\.webp$/.exec(src)![0];
  await bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: key }));

  await emptyPage.goto(`/profile/${id}`);
  await expect(emptyPage.getByRole('img', { name: me.name })).toHaveJSProperty('naturalWidth', 512);

  // An Avatar is not a share: no new file, no storage used.
  expect(await usedFigure()).toBe(storageBefore);
  expect(await filesInAllFiles()).toBe(filesBefore);

  await openProfileSettings(workerPage);
  await workerPage.getByRole('button', { name: 'Remove' }).click();
  await expect(workerPage.getByText('Avatar removed')).toBeVisible();
  await expect(workerPage.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  await expect(navAvatar).toHaveCount(0);
  await expect(accountName(workerPage)).toContainText(me.name[0]!.toUpperCase());
  await expect(bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: key }))).rejects.toThrow();

  await emptyPage.reload();
  await expect(emptyPage.getByRole('img', { name: me.name })).toHaveCount(0);
});

test('a file that is not an image is refused as an Avatar', async ({ workerPage, corpus }) => {
  await openProfileSettings(workerPage);

  await expect(async () => {
    await workerPage.getByTestId('avatar-input').setInputFiles(corpus.file('notes.txt').path);
    await expect(workerPage.getByText('That file is not an image we can read')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(workerPage.getByRole('button', { name: 'Remove' })).toHaveCount(0);
});
