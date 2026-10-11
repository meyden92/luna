import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { clickUntil } from '../utils/hydration';
import { uniquePrefix } from '../utils/own-files';
import { createToken, filePart, revokeToken, sharexPost, storedFile, withToken } from '../utils/uploads';

// Settings → Uploads & ShareX: Tokens, the ShareX config they feed, and the upload defaults.
// Serial, so the stack's ShareX concurrency of 2 is never approached.
test.describe.configure({ mode: 'serial' });

test('a Token is shown once, uploads while it exists, and is refused with 401 once revoked', async ({
  workerPage,
  playwright,
  stack,
  corpus,
}) => {
  const entry = corpus.file('notes.txt');
  const bytes = readFileSync(entry.path);
  const prefix = uniquePrefix('tok-life');
  const name = `${prefix}-laptop`;

  const key = await createToken(workerPage, name);

  // After "Done" the value is gone from the page, also after a reload.
  await expect(workerPage.getByText(key)).toHaveCount(0);
  await workerPage.reload();
  await expect(workerPage.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  await expect(workerPage.getByText(key)).toHaveCount(0);

  const accepted = await sharexPost(playwright, stack.E2E_BASE_URL, filePart({ ...entry, name: `${prefix}.txt` }, bytes), { bearer: key });
  expect(accepted.status).toBe(200);

  await revokeToken(workerPage, name);
  const refused = await sharexPost(playwright, stack.E2E_BASE_URL, filePart({ ...entry, name: `${prefix}-after.txt` }, bytes), {
    bearer: key,
  });
  expect(refused.status).toBe(401);
});

test('"Create token" waits for a name', async ({ workerPage }) => {
  await workerPage.goto('/settings');
  const dialog = workerPage.getByRole('dialog', { name: 'New upload token' });

  await clickUntil(workerPage.getByRole('button', { name: 'New token' }), dialog);
  await expect(dialog.getByRole('button', { name: 'Create token' })).toBeDisabled();
  await dialog.getByLabel('Name').fill('anything');
  await expect(dialog.getByRole('button', { name: 'Create token' })).toBeEnabled();
});

test('the downloaded ShareX config, used as it is, uploads a file and hands back a working link', async ({
  workerPage,
  playwright,
  corpus,
  db,
  bucket,
}) => {
  const entry = corpus.file('landscape-photo.jpg');
  const bytes = readFileSync(entry.path);
  const title = `${uniquePrefix('tok-sxcu')} ${entry.name}`;

  await withToken(workerPage, 'tok-sxcu', async () => {
    await workerPage.goto('/settings');
    const downloadButton = workerPage.getByRole('button', { name: 'Download config' });
    await expect(downloadButton).toBeEnabled();
    const downloading = workerPage.waitForEvent('download');
    await downloadButton.click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.sxcu$/);
    await expect(workerPage.getByText('LunaShare.sxcu downloaded')).toBeVisible();
    const config = JSON.parse(readFileSync((await download.path())!, 'utf8')) as {
      RequestURL: string;
      Body: string;
      Arguments: Record<string, string>;
      FileFormName: string;
      URL: string;
      ThumbnailURL: string;
    };
    expect(config.Body).toBe('MultipartFormData');

    // What ShareX does: a multipart POST to RequestURL, the file under FileFormName, the Arguments as
    // form fields with $filename$ and $input$ filled in, and no cookie.
    const sharex = await playwright.request.newContext();
    try {
      const fields = Object.fromEntries(
        Object.entries(config.Arguments).map(([field, value]) => [field, value.replace('$filename$', title).replace('$input$', '')]),
      );
      const response = await sharex.post(config.RequestURL, {
        multipart: { [config.FileFormName]: { name: title, mimeType: entry.mimeType, buffer: bytes }, ...fields },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { data: { link: string; thumbnail: string } };

      // URL and ThumbnailURL are `$json:data.link$` / `$json:data.thumbnail$`.
      expect(config.URL).toBe('$json:data.link$');
      expect(config.ThumbnailURL).toBe('$json:data.thumbnail$');
      expect((await storedFile(db, bucket, title)).bytes.equals(bytes)).toBe(true);
      const fetched = (await workerPage.goto(body.data.link))!;
      expect(fetched.ok()).toBe(true);
      expect((await fetched.body()).equals(bytes)).toBe(true);
    } finally {
      await sharex.dispose();
    }
  });
});

test('without a Token the config cannot be downloaded and the defaults wait', async ({ emptyPage }) => {
  await emptyPage.goto('/settings');

  await expect(emptyPage.getByText('No upload tokens yet.')).toBeVisible();
  await expect(emptyPage.getByRole('button', { name: 'Download config' })).toBeDisabled();
  await expect(emptyPage.getByText('Create an upload token below first.')).toBeVisible();
  await expect(emptyPage.getByRole('switch', { name: 'Remove photo location' })).toBeDisabled();
  await expect(emptyPage.getByText('Create an upload token above to set defaults.')).toBeVisible();
});

test('"Remove photo location" is remembered after a reload, and visibility is not configurable yet', async ({ workerPage }) => {
  await withToken(workerPage, 'tok-defaults', async () => {
    await workerPage.goto('/settings');
    const strip = workerPage.getByRole('switch', { name: 'Remove photo location' });
    await expect(strip).not.toBeChecked();
    await expect(workerPage.getByText('Not configurable yet — new uploads keep their current visibility.')).toBeVisible();

    await strip.click();
    await expect(strip).toBeChecked();
    await workerPage.reload();
    await expect(strip).toBeChecked();

    await strip.click();
    await expect(strip).not.toBeChecked();
    await workerPage.reload();
    await expect(strip).not.toBeChecked();
  });
});
