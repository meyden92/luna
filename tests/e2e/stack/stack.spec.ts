import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

// Sanity checks for the disposable stack itself: the app is up, the suite can
// reach RustFS, and the browser reaches storage under the app's CDN_URL.

test('/api/health reports ok', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok' });
});

test('the bucket fixture can list the bucket', async ({ bucket }) => {
  const listing = await bucket.client.send(new ListObjectsV2Command({ Bucket: bucket.name }));
  expect(listing.$metadata.httpStatusCode).toBe(200);
});

test('a public object in the bucket loads in the browser through CDN_URL', async ({ page, bucket, stack }) => {
  const key = `stack-check/${randomUUID()}.txt`;
  const body = `hello from ${key}`;
  await bucket.client.send(new PutObjectCommand({ Bucket: bucket.name, Key: key, Body: body, ContentType: 'text/plain' }));

  try {
    // CDN_URL names host.docker.internal, which only the browser's resolver
    // rule maps to the published RustFS port.
    const response = await page.goto(`${stack.E2E_CDN_URL}/${key}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).toHaveText(body);
  } finally {
    await bucket.client.send(new DeleteObjectCommand({ Bucket: bucket.name, Key: key }));
  }
});
