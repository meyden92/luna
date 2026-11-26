import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { expect, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { studioTemplate } from '../../../../src/db/schema/studio';
import { test } from '../../fixtures/test';
import type { StackEnv } from '../../stack-env';
import { falRequestContaining, falUploads } from '../../utils/fal-fake';
import { untilHydrated } from '../../utils/hydration';
import { uniquePrefix } from '../../utils/own-files';
import { seedStudioModel } from '../../utils/studio';

// A Template's reference images: an admin uploads one into fake/edit's image
// list beside a User upload slot, puts the User's slot first, and every run of
// the Template sends both in that order. The fake's recorded uploads name the
// files it received.

const FINISH_TIMEOUT_MS = 30_000;

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** The names of the files the app uploaded to fal storage for a request's image list, in order. */
async function sentImages(stack: StackEnv, text: string): Promise<(string | undefined)[]> {
  const sent = await falRequestContaining(stack, text);
  const uploads = await falUploads(stack);
  return (sent.input.image_urls as unknown[]).map((url) => uploads.find((upload) => upload.file_url === url)?.file_name);
}

const slots = (field: Locator) => field.getByLabel(/^Slot \d+ of image_urls$/);

test('a Template sends its reference image and the User upload in the order the admin set, and removes the image with the Template', async ({
  adminPage: page,
  workerPage,
  db,
  bucket,
  stack,
  corpus,
}) => {
  const model = await seedStudioModel(db, stack, { label: 'Referenz', endpointId: 'fake/edit' });
  const name = uniquePrefix('Stilvorlage');
  const prefix = uniquePrefix('reference');
  const styleFile = corpus.file('square-food.png');
  const photoFile = corpus.file('portrait-tall.webp');

  await page.goto('/admin/studio/templates/new');
  await untilHydrated(page.getByLabel('Name', { exact: true }));
  await page.getByLabel('Name', { exact: true }).fill(name);
  await choose(page, 'Model', model.name);
  await region(page, 'Field prompt').getByLabel('Value', { exact: true }).fill(`${prefix} Paint image 1 in the style of image 2 {note}`);

  // A reference image fixes the input; a User upload slot goes after it.
  const images = region(page, 'Field image_urls');
  await images.getByLabel('Reference image for image_urls').setInputFiles(styleFile.path);
  await images.getByRole('button', { name: 'Add user upload' }).click();
  await region(page, 'Variable file').getByLabel('Label', { exact: true }).fill('Your photo');
  await expect(slots(images)).toHaveCount(2);
  await expect(slots(images).nth(0).getByRole('img', { name: 'Reference image 1' })).toBeVisible();
  await expect(slots(images).nth(1)).toContainText('User upload {file}');

  // The User's slot moves to the front, by keyboard.
  const handle = slots(images).nth(1).getByRole('button', { name: 'Drag to reorder' });
  await handle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(slots(images).nth(0)).toContainText('User upload {file}');
  await expect(slots(images).nth(1).getByRole('img', { name: 'Reference image 2' })).toBeVisible();

  // A test run sends the unsaved reference image after the User's file.
  const preview = page.getByTestId('studio-preview');
  await expect(preview.getByLabel('Image Urls')).toHaveCount(0);
  await preview.getByLabel('Note', { exact: true }).fill('as a test');
  await preview.getByLabel('Your photo').setInputFiles(photoFile.path);
  await preview.getByRole('button', { name: 'Test' }).click();
  await expect(preview.getByTestId('studio-test-result')).toContainText('Test succeeded', { timeout: FINISH_TIMEOUT_MS });
  expect(await sentImages(stack, `${prefix} Paint image 1 in the style of image 2 as a test`)).toEqual([photoFile.name, styleFile.name]);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Template saved')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/studio\/templates\/[0-9a-f-]+$/);
  const id = new URL(page.url()).pathname.split('/').pop() as string;

  // Stored: the image is the Template's own object, and the editor shows it again.
  const [row] = await db.select({ fields: studioTemplate.fields }).from(studioTemplate).where(eq(studioTemplate.id, id));
  const stored = row?.fields.find((field) => field.name === 'image_urls')?.value;
  expect(stored).toEqual([{ source: 'template', key: expect.stringMatching(/^studio-templates\//) }]);
  const key = (stored as { key: string }[])[0]?.key as string;
  await page.reload();
  await expect(slots(region(page, 'Field image_urls')).nth(1).getByRole('img', { name: 'Reference image 2' })).toBeVisible();

  // A User sees only their own slot, and the run sends the stored reference image after it.
  await workerPage.goto(`/studio?category=${model.categoryId}&template=${id}`);
  const form = workerPage.getByRole('region', { name: 'Generate' });
  await untilHydrated(form.getByRole('button', { name: 'Generate' }));
  await expect(form.getByLabel('Image Urls')).toHaveCount(0);
  await form.getByLabel('Note', { exact: true }).fill('for real');
  await form.getByLabel('Your photo').setInputFiles(photoFile.path);
  await form.getByRole('button', { name: 'Generate' }).click();
  expect(await sentImages(stack, `${prefix} Paint image 1 in the style of image 2 for real`)).toEqual([
    photoFile.name,
    key.slice(key.lastIndexOf('/') + 1),
  ]);

  // Deleting the Template removes its reference image.
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Template deleted')).toBeVisible();
  await expect(bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: key }))).rejects.toThrow();
});
