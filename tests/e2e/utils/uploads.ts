import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { file } from '../../../src/db/schema/files';
import type { CorpusEntry } from '../fixtures/corpus';
import type { TestDb } from '../fixtures/db';
import { clientIpHeader } from '../fixtures/users';
import { clickUntil } from './hydration';

/** The S3 client and bucket name of the `bucket` fixture. */
type Bucket = { client: import('@aws-sdk/client-s3').S3Client; name: string };

/** A stored file as the database and the bucket hold it. */
export interface StoredFile {
  id: string;
  title: string;
  size: number;
  contentType: string;
  private: boolean;
  folderId: string | null;
  scrubReport: unknown;
  /** The bucket key: `<ownerId>/<stored name>`, with the stored name's URL encoding undone. */
  key: string;
  /** The object's bytes, read from the bucket. */
  bytes: Buffer;
}

/** `formatSize(size, { precision: 1, trim: true })` as the Preview's Size row shows it. */
export function sizeLabel(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = bytes < 1024 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  if (unit === 0) return `${bytes} B`;
  return `${Number.parseFloat((bytes / 1024 ** unit).toFixed(1))} ${units[unit]}`;
}

/** The row of the file with this (test-unique) title, with its object read from the bucket. */
export async function storedFile(db: TestDb, bucket: Bucket, title: string): Promise<StoredFile> {
  const rows = await db
    .select()
    .from(file)
    .where(and(eq(file.title, title), eq(file.isDeleted, false)));
  expect(rows, `one stored file titled ${title}`).toHaveLength(1);
  const row = rows[0]!;
  const key = `${row.ownerId}/${decodeURIComponent(row.url)}`;
  const object = await bucket.client.send(new GetObjectCommand({ Bucket: bucket.name, Key: key }));
  return {
    id: row.id,
    title: row.title ?? '',
    size: row.size,
    contentType: row.contentType,
    private: row.private,
    folderId: row.folderId,
    scrubReport: row.scrubReport,
    key,
    bytes: Buffer.from(await object.Body!.transformToByteArray()),
  };
}

/** Keys in the bucket under `<ownerId>/` that contain `fragment` (a name or title the upload would have used). */
export async function bucketKeysContaining(bucket: Bucket, ownerId: string, fragment: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await bucket.client.send(
      new ListObjectsV2Command({ Bucket: bucket.name, Prefix: `${ownerId}/`, ContinuationToken: token }),
    );
    keys.push(...(page.Contents ?? []).map((object) => object.Key ?? ''));
    token = page.NextContinuationToken;
  } while (token);
  return keys.filter((key) => key.includes(fragment));
}

/** A multipart `file` part for an API upload, named `name`. */
export const filePart = (entry: CorpusEntry, buffer: Buffer): { name: string; mimeType: string; buffer: Buffer } => ({
  name: entry.name,
  mimeType: entry.mimeType,
  buffer,
});

/** Creates a Token under Settings → Upload tokens and returns the key shown once. Leaves the page on /settings. */
export async function createToken(page: Page, name: string): Promise<string> {
  await page.goto('/settings');
  const create = page.getByRole('dialog', { name: 'New upload token' });
  await clickUntil(page.getByRole('button', { name: 'New token' }), create);
  await create.getByLabel('Name').fill(name);
  await create.getByRole('button', { name: 'Create token' }).click();

  const reveal = page.getByRole('dialog', { name: 'Copy your token now' });
  // The raw key is the text right before the Copy button.
  const key = (await reveal.getByRole('button', { name: 'Copy' }).locator('xpath=preceding-sibling::span').textContent())?.trim();
  expect(key).toBeTruthy();
  await reveal.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  return key!;
}

/** Revokes the Token named `name` from the Upload tokens table. */
export async function revokeToken(page: Page, name: string): Promise<void> {
  await page
    .getByRole('row', { name: new RegExp(name) })
    .getByRole('button', { name: 'Revoke' })
    .click();
  await expect(page.getByText('Token revoked')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
}

/** A multipart `file` part. */
export type UploadPart = { name: string; mimeType: string; buffer: Buffer };

/** A ShareX-style multipart POST with no session cookie, only what the client sends. */
export async function sharexPost(
  playwright: import('@playwright/test').PlaywrightWorkerArgs['playwright'],
  baseURL: string,
  upload: UploadPart,
  options: { bearer?: string; formToken?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const context: APIRequestContext = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { ...clientIpHeader(), ...(options.bearer ? { Authorization: `Bearer ${options.bearer}` } : {}) },
  });
  try {
    const response = await context.post('/api/upload/sharex', {
      multipart: { file: upload, ...(options.formToken ? { token: options.formToken } : {}) },
    });
    return { status: response.status(), body: await response.json() };
  } finally {
    await context.dispose();
  }
}

/** Creates a Token named after `label`, runs `body` with its key, and revokes it again. */
export async function withToken(page: Page, label: string, body: (key: string) => Promise<void>): Promise<void> {
  const name = `${label}-${randomBytes(3).toString('hex')}`;
  const key = await createToken(page, name);
  try {
    await body(key);
  } finally {
    await page.goto('/settings');
    await revokeToken(page, name);
  }
}

/** The Token options the settings page has no controls for (it only offers the folder and "Remove photo location"). */
export interface TokenOptions {
  compressImage: boolean;
  convertToJpeg: boolean;
  /** 1 to 100 within the app's own bounds. */
  jpegQuality: number;
}

const seroval = {
  value: (value: boolean | number) => (typeof value === 'number' ? { t: 0, s: value } : { t: 2, s: value ? 2 : 3 }),
};

/**
 * Sets a Token's compress, convert-to-JPEG and quality options through `updateTokenSettings`.
 * The settings page has no controls for them, so this takes the request the page makes when the
 * "Remove photo location" switch is flipped (which carries every field), rewrites those fields and
 * replays it; strip metadata and the folder are written back off and empty. Applies to all of the
 * user's Tokens, like the page's own controls. Leaves the page reloaded on /settings.
 */
export async function setTokenOptions(page: Page, options: TokenOptions): Promise<void> {
  await page.goto('/settings');
  const toggle = page.getByRole('switch');
  await expect(toggle).toBeEnabled();
  const captured = page.waitForRequest((request) => request.url().includes('/_serverFn/') && request.method() === 'POST');
  await toggle.click();
  const request = await captured;

  const body = JSON.parse(request.postData() ?? '') as { t: { p: { v: { p: { k: string[]; v: unknown[] } }[] } } };
  const { k, v } = body.t.p.v[0]!.p;
  const fields: Record<string, boolean | number> = { ...options, stripMetadata: false };
  for (const [name, value] of Object.entries(fields)) v[k.indexOf(name)] = seroval.value(value);

  const response = await page.request.post(request.url(), {
    headers: { 'x-tsr-serverFn': 'true', origin: new URL(page.url()).origin, 'content-type': 'application/json' },
    data: body,
  });
  expect(response.ok()).toBe(true);
  expect(await response.text()).not.toContain('$TSR/Error');
  await page.reload();
}

/**
 * POSTs to an upload route declaring a `Content-Length` of `declared` bytes and sends only the
 * headers, never the body: the refusal has to come from the length alone. `headers` carries the
 * session cookie or Authorization header. Returns the status and body text of the answer.
 */
export function declaredLengthPost(
  baseURL: string,
  path: string,
  headers: Record<string, string>,
  declared: number,
): Promise<{ status: number; body: string }> {
  const base = new URL(baseURL);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: base.hostname,
        port: base.port,
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data; boundary=declared-only',
          'Content-Length': String(declared),
          ...clientIpHeader(),
        },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.flushHeaders();
  });
}
