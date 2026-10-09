import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { file } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { scopeRow } from '../utils/files-screen';
import { clickUntil } from '../utils/hydration';
import { createFolderThroughSidebar, uniquePrefix } from '../utils/own-files';
import { declaredLengthPost, uploadFileInput } from '../utils/uploads';

// Upload refusals. Each is asserted twice: the status and `code` the API answers a client
// with, and what the Upload sheet tells the user. The sheet checks type, emptiness and size
// itself before sending anything, so for those three the sheet's own wording is what shows;
// only a vanished folder (and, in quota.spec.ts, a full quota) is refused by the server
// and reported through the sheet.

const MIB = 1024 * 1024;

/** POSTs a multipart upload with `file` (and extra fields) and returns status and JSON body. */
async function postUpload(
  request: APIRequestContext,
  upload: { name: string; mimeType: string; buffer: Buffer },
  fields: Record<string, string> = {},
): Promise<{ status: number; body: { error: string; code: string } }> {
  const response = await request.post('/api/upload/web', { multipart: { file: upload, ...fields } });
  return { status: response.status(), body: await response.json() };
}

async function openSheet(page: Page) {
  await page.goto('/dashboard');
  const heading = page.getByRole('heading', { name: 'Upload files' });
  await clickUntil(page.getByRole('button', { name: 'Upload', exact: true }).first(), heading);
  return page.getByRole('dialog', { name: 'Upload files' });
}

test('a type outside the allowlist is refused with 415, and the sheet will not take the file', async ({
  workerRequest,
  workerPage,
  corpus,
}) => {
  const entry = corpus.edgeCase('unsupported-type');
  const title = `${uniquePrefix('err-type')}.wasm`;

  const { status, body } = await postUpload(
    workerRequest,
    { name: entry.name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) },
    { filename: title },
  );
  expect(status).toBe(415);
  expect(body.code).toBe('UNSUPPORTED_FILE_TYPE');
  expect(body.error).toBe('Unsupported file type: application/wasm');

  const sheet = await openSheet(workerPage);
  await uploadFileInput(workerPage).setInputFiles({ name: entry.name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) });
  await expect(workerPage.getByText(`Can’t upload ${entry.name} — this kind of file can’t be uploaded`)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();
});

test('a zero-byte file is refused with 400, and the sheet will not take the file', async ({ workerRequest, workerPage, corpus }) => {
  const entry = corpus.edgeCase('zero-byte');

  const { status, body } = await postUpload(workerRequest, { name: entry.name, mimeType: entry.mimeType, buffer: Buffer.alloc(0) });
  expect(status).toBe(400);
  expect(body).toEqual({ error: 'File is empty', code: 'VALIDATION_FAILED' });

  const sheet = await openSheet(workerPage);
  await uploadFileInput(workerPage).setInputFiles({ name: entry.name, mimeType: entry.mimeType, buffer: Buffer.alloc(0) });
  await expect(workerPage.getByText(`Can’t upload ${entry.name} — it is empty`)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();
});

test('an unknown folderId is refused with 400 and nothing is stored', async ({ workerRequest, corpus, db }) => {
  const entry = corpus.file('notes.txt');
  const title = `${uniquePrefix('err-folder')} ${entry.name}`;

  const { status, body } = await postUpload(
    workerRequest,
    { name: entry.name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) },
    { filename: title, folderId: randomUUID() },
  );

  expect(status).toBe(400);
  expect(body).toEqual({ error: 'Unknown folder', code: 'VALIDATION_FAILED' });
  expect(await db.select().from(file).where(eq(file.title, title))).toHaveLength(0);
});

test('a folder deleted while the sheet is open is refused, and the sheet says so', async ({ workerPage, corpus, db }) => {
  const prefix = uniquePrefix('err-gone');
  const folder = `${prefix}-box`;
  const entry = corpus.file('notes.txt');
  await workerPage.goto('/dashboard');
  await createFolderThroughSidebar(workerPage, folder);
  await scopeRow(workerPage, folder).click();
  await workerPage.getByRole('button', { name: 'Upload', exact: true }).first().click();
  const sheet = workerPage.getByRole('dialog', { name: 'Upload files' });
  await expect(sheet.getByRole('combobox', { name: 'Folder' })).toHaveText(new RegExp(folder));
  await uploadFileInput(workerPage).setInputFiles({
    name: `${prefix} ${entry.name}`,
    mimeType: entry.mimeType,
    buffer: readFileSync(entry.path),
  });

  // The folder goes away in another tab of the same session.
  const otherTab = await workerPage.context().newPage();
  await otherTab.goto('/dashboard');
  const row = scopeRow(otherTab, folder);
  await row.hover();
  await otherTab.getByRole('button', { name: `Actions for ${folder}` }).click();
  await otherTab.getByRole('menuitem', { name: 'Delete' }).click();
  await otherTab
    .getByRole('alertdialog', { name: `Delete “${folder}”?` })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(row).toHaveCount(0);
  await otherTab.close();

  await sheet.getByRole('button', { name: 'Upload 1 file' }).click();

  await expect(workerPage.getByText('That folder no longer exists. Pick another and try again.')).toBeVisible();
  // The file stays queued, now aimed at no folder.
  await expect(sheet.getByRole('combobox', { name: 'Folder' })).toHaveText(/Not in a folder/);
  expect(
    await db
      .select()
      .from(file)
      .where(eq(file.title, `${prefix} ${entry.name}`)),
  ).toHaveLength(0);
});

test('a request declaring more than 90 MB is refused with 413 before any bytes are sent', async ({ workerRequest, stack }) => {
  const { cookies } = await workerRequest.storageState();
  const cookie = cookies.map((item) => `${item.name}=${item.value}`).join('; ');

  const result = await declaredLengthPost(stack.E2E_BASE_URL, '/api/upload/web', { Cookie: cookie }, 92 * MIB);

  expect(result.status).toBe(413);
  expect(JSON.parse(result.body)).toEqual({ error: 'File too large', code: 'PAYLOAD_TOO_LARGE' });
});

test('a file over 90 MB is turned away by the sheet before it is sent', async ({ workerPage }) => {
  const sheet = await openSheet(workerPage);
  const input = uploadFileInput(workerPage);

  // 91 MiB of zeros built inside the page; pushing that many bytes through the test runner would only be slow.
  await input.evaluate((element: HTMLInputElement) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(91 * 1024 * 1024)], 'huge.txt', { type: 'text/plain' }));
    element.files = transfer.files;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect(workerPage.getByText('Can’t upload huge.txt — it is larger than 90.00 MB')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();
});
