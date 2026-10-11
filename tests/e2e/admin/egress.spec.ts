import { expect } from '@playwright/test';
import { formatSize } from '../../../src/libs/utils';
import { test } from '../fixtures/test';
import { createUserThroughAdmin, signedInDevice, throwawayUser, userIdOf } from '../utils/admin-users';
import { uniquePrefix, uploadOwnFiles } from '../utils/own-files';

// Egress is rolled up per owner, so a throwaway owner whose only traffic is the two deliveries
// below shows exactly those bytes and requests.

test("downloading a file and a rendition adds exactly their bytes to the owner's egress", async ({ adminPage, browser, corpus, db }) => {
  const account = throwawayUser('egress');
  await adminPage.goto('/admin/users');
  await createUserThroughAdmin(adminPage, account);
  const ownerId = await userIdOf(db, account.email);
  const device = await signedInDevice(browser, account);
  const image = corpus.file('square-food.png');
  const [upload] = await uploadOwnFiles(device.request, uniquePrefix('egress'), [image]);

  const original = await device.request.get(`/api/d/${upload!.id}`);
  expect(original.status()).toBe(200);
  const originalBytes = (await original.body()).byteLength;
  expect(originalBytes).toBe(image.size);

  const rendition = await device.request.get(`/cdn/${upload!.id}/w=64,fmt=png`);
  expect(rendition.status()).toBe(200);
  const renditionBytes = (await rendition.body()).byteLength;

  await adminPage.goto('/admin/egress');
  await expect(adminPage.getByRole('heading', { name: 'Egress' })).toBeVisible();
  const row = adminPage.getByRole('row').filter({ hasText: ownerId });
  await expect(row.getByRole('cell').nth(1)).toHaveText('2');
  await expect(row.getByRole('cell').nth(2)).toHaveText(formatSize(originalBytes + renditionBytes));
});
