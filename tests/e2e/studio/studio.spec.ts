import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { expect, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { generation, generationOutput } from '../../../src/db/schema/studio';
import type { TestDb } from '../fixtures/db';
import { test } from '../fixtures/test';
import { MEDIA } from '../stack/fal-fake/catalog';
import { falRequestContaining, falRequests, falUploads, releaseFalRequest } from '../utils/fal-fake';
import { openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';
import { historyEntry, openStudio, type SeededModel, seedStudioModel } from '../utils/studio';

// The Studio screen as a User sees it, against the fake fal service. Each test
// seeds its own Categories and Models (they are global) and finds its history
// entries by the Model's unique name; the worker user runs every Generation.

const FINISH_TIMEOUT_MS = 30_000;

async function generate(page: Page, prompt: string) {
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill(prompt);
  await page.getByRole('button', { name: 'Generate' }).click();
}

async function expectDone(page: Page, model: SeededModel) {
  await expect(historyEntry(page, model).getByText('Done')).toBeVisible({ timeout: FINISH_TIMEOUT_MS });
}

test('a User generates an image and sees it in the history, also at phone width', async ({ workerPage, db, stack, bucket }) => {
  const model = await seedStudioModel(db, stack, { label: 'Bilder', endpointId: 'fake/image' });
  const prompt = uniquePrefix('a lighthouse');

  await openStudio(workerPage, model);
  await expect(workerPage.getByRole('button', { name: model.categoryName })).toHaveAttribute('aria-pressed', 'true');
  await expect(workerPage.getByTestId('studio-estimate')).toHaveText('≈ 0.03 $');
  await expect(workerPage.getByTestId('studio-budget')).toHaveText(/ \$ spent, unlimited$/);
  await generate(workerPage, prompt);

  const entry = historyEntry(workerPage, model);
  await expect(entry).toContainText(prompt);
  await expectDone(workerPage, model);
  await expect(entry).toContainText('≈ 0.03 $');
  await expect(entry).toContainText('expires in 7 days');

  // The Output was copied from the fake into our storage, byte for byte.
  const [stored] = await db
    .select({
      s3Key: generationOutput.s3Key,
      mediaKind: generationOutput.mediaKind,
      contentType: generationOutput.contentType,
      width: generationOutput.width,
      height: generationOutput.height,
    })
    .from(generationOutput)
    .innerJoin(generation, eq(generation.id, generationOutput.generationId))
    .where(eq(generation.modelId, model.id));
  expect(stored).toMatchObject({ mediaKind: 'image', contentType: 'image/png', width: 128, height: 128 });
  const object = await bucket.client.send(new GetObjectCommand({ Bucket: bucket.name, Key: stored!.s3Key }));
  const fixture = Buffer.from(await (await fetch(`${stack.E2E_FAL_URL}/media/${MEDIA.image.name}`)).arrayBuffer());
  expect(Buffer.from(await object.Body!.transformToByteArray()).equals(fixture)).toBe(true);
  await expect(entry.getByRole('img', { name: 'Output 1' })).toBeVisible();
  await entry.getByRole('button', { name: 'Open Output 1 full size' }).click();
  await expect(workerPage.getByRole('dialog', { name: 'Output 1' }).getByRole('img')).toBeVisible();
  await workerPage.keyboard.press('Escape');

  // Below 768 px the history follows the form.
  await workerPage.setViewportSize({ width: 375, height: 812 });
  await openStudio(workerPage, model);
  const form = await workerPage.getByRole('button', { name: 'Generate' }).boundingBox();
  const history = await workerPage.getByRole('region', { name: 'History' }).boundingBox();
  expect(history!.y).toBeGreaterThan(form!.y);
  expect(history!.x).toBeLessThan(form!.x + form!.width);
  await generate(workerPage, `${prompt} again`);
  await expect(historyEntry(workerPage, model)).toContainText(`${prompt} again`);
  await expectDone(workerPage, model);
});

test('Again draws a new seed, and Use settings fills the form, also after the Output expired', async ({ workerPage, db, stack }) => {
  const model = await seedStudioModel(db, stack, {
    label: 'Seeded',
    endpointId: 'fake/image',
    fields: (fields) => fields.map((field) => (field.name === 'seed' ? { ...field, mode: 'shown' } : field)),
  });
  const prompt = uniquePrefix('a red fox');

  await openStudio(workerPage, model);
  await workerPage.getByLabel('Seed', { exact: true }).fill('42');
  await generate(workerPage, prompt);
  await expectDone(workerPage, model);
  const [first] = await db.select({ id: generation.id }).from(generation).where(eq(generation.modelId, model.id));

  await historyEntry(workerPage, model).getByRole('button', { name: 'Again' }).click();
  await expect(workerPage.getByRole('region', { name: 'History' }).getByRole('article', { name: model.name })).toHaveCount(2);
  await expectDone(workerPage, model);
  await expect.poll(async () => (await falRequests(stack)).filter((request) => request.input.prompt === prompt).length).toBe(2);
  const seeds = (await falRequests(stack)).filter((request) => request.input.prompt === prompt).map((request) => request.input.seed);
  expect(seeds).toContain(42);
  expect(seeds.find((seed) => seed !== 42)).toEqual(expect.any(Number));

  // The sweep's work, done directly: the first Generation's Output is gone.
  await db
    .update(generationOutput)
    .set({ expiredAt: new Date() })
    .where(inArray(generationOutput.generationId, [first!.id]));
  await openStudio(workerPage, model);
  const expired = workerPage.getByRole('region', { name: 'History' }).getByRole('article', { name: model.name }).last();
  await expect(expired.getByText('Output expired').first()).toBeVisible();

  await workerPage.getByRole('textbox', { name: 'Prompt', exact: true }).fill('something else');
  await expired.getByRole('button', { name: 'Use settings' }).click();
  await expect(workerPage.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue(prompt);
  await expect(workerPage.getByLabel('Seed', { exact: true })).toHaveValue('42');

  await expired.getByRole('button', { name: 'Again' }).click();
  await expect(workerPage.getByRole('region', { name: 'History' }).getByRole('article', { name: model.name })).toHaveCount(3);
});

test('Continue with … offers only Categories that take images and attaches the Output to the video Model', async ({
  workerPage,
  db,
  stack,
}) => {
  const image = await seedStudioModel(db, stack, { label: 'Stills', endpointId: 'fake/image' });
  const video = await seedStudioModel(db, stack, { label: 'Animate', endpointId: 'fake/video', icon: 'Video' });
  const audio = await seedStudioModel(db, stack, { label: 'Sounds', endpointId: 'fake/audio', icon: 'AudioLines' });
  const prompt = uniquePrefix('a paper boat');

  await openStudio(workerPage, image);
  await generate(workerPage, prompt);
  await expectDone(workerPage, image);

  await historyEntry(workerPage, image).getByRole('button', { name: 'Continue with…' }).click();
  const menu = workerPage.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: video.categoryName })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: audio.categoryName })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: image.categoryName })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: video.categoryName }).click();

  await expect(workerPage).toHaveURL(new RegExp(`category=${video.categoryId}`));
  await expect(workerPage.getByRole('heading', { name: video.name })).toBeVisible();
  await expect(workerPage.getByText('Studio Output')).toBeVisible();
  await expect(workerPage.getByTestId('studio-estimate')).toHaveText('≈ 0.50 $');
  const videoPrompt = `${prompt} sails away`;
  await generate(workerPage, videoPrompt);
  await expectDone(workerPage, video);

  const request = await falRequestContaining(stack, videoPrompt);
  const upload = (await falUploads(stack)).find((entry) => entry.file_url === request.input.image_url);
  expect(upload).toMatchObject({ content_type: 'image/png' });
  await expect(historyEntry(workerPage, video).locator('video')).toHaveAttribute('src', /.+/);

  // The media kind filter narrows the history to videos.
  await workerPage.getByRole('group', { name: 'Filter by media kind' }).getByRole('button', { name: 'Video' }).click();
  await expect(workerPage.getByRole('region', { name: 'History' }).getByRole('article', { name: image.name })).toHaveCount(0);
  await expect(historyEntry(workerPage, video)).toBeVisible();
});

test('audio plays and a 3D model made from a picked file renders inline', async ({ workerPage, workerRequest, db, stack, corpus }) => {
  const audio = await seedStudioModel(db, stack, { label: 'Tones', endpointId: 'fake/audio', icon: 'AudioLines' });
  const mesh = await seedStudioModel(db, stack, { label: 'Meshes', endpointId: 'fake/3d', icon: 'Box' });
  const prefix = uniquePrefix('studio-input');
  const [picked] = await uploadOwnFiles(workerRequest, prefix, [corpus.file('icon-small.png')]);

  await openStudio(workerPage, audio);
  await generate(workerPage, uniquePrefix('a bell'));
  await expectDone(workerPage, audio);
  await expect(historyEntry(workerPage, audio).locator('audio')).toHaveAttribute('src', /.+/);

  await openStudio(workerPage, mesh);
  await workerPage.getByRole('button', { name: 'Choose…' }).click();
  const picker = workerPage.getByRole('dialog', { name: 'Choose files' });
  await picker.getByRole('button', { name: picked!.title }).click();
  await picker.getByRole('button', { name: 'Use 1 file' }).click();
  await expect(workerPage.getByText('From your Files', { exact: true })).toBeVisible();
  await workerPage.getByRole('button', { name: 'Generate' }).click();
  await expectDone(workerPage, mesh);
  await expect(historyEntry(workerPage, mesh).locator('model-viewer')).toBeVisible();
});

test('a [slow] Generation is cancelled, and the active limit is refused inline', async ({ workerPage, db, stack }) => {
  const model = await seedStudioModel(db, stack, { label: 'Slow', endpointId: 'fake/image' });
  const prompt = `${uniquePrefix('slow')} [slow]`;

  await openStudio(workerPage, model);
  for (const n of [1, 2, 3]) await generate(workerPage, `${prompt} ${n}`);
  const entries = workerPage.getByRole('region', { name: 'History' }).getByRole('article', { name: model.name });
  await expect(entries).toHaveCount(3);

  await generate(workerPage, `${prompt} 4`);
  await expect(workerPage.getByRole('region', { name: 'Generate' }).getByRole('alert')).toHaveText(
    'You already have 3 Generations running. Wait for one to finish, or cancel one.',
  );

  for (const n of [1, 2, 3]) {
    const entry = entries.filter({ hasText: `${prompt} ${n}` });
    await expect(entry.getByText('Running')).toBeVisible({ timeout: FINISH_TIMEOUT_MS });
    await entry.getByRole('button', { name: 'Cancel' }).click();
    await expect(entry.getByText('Cancelled')).toBeVisible();
  }
  expect((await falRequests(stack)).filter((request) => String(request.input.prompt).startsWith(prompt)).every((r) => r.cancelled)).toBe(
    true,
  );
});

test('a [fail] Generation shows fal’s error and is retried', async ({ workerPage, db, stack }) => {
  const model = await seedStudioModel(db, stack, { label: 'Failing', endpointId: 'fake/image' });
  const prompt = `${uniquePrefix('broken')} [fail]`;

  await openStudio(workerPage, model);
  await generate(workerPage, prompt);
  const entry = historyEntry(workerPage, model);
  await expect(entry.getByText('Failed', { exact: true })).toBeVisible({ timeout: FINISH_TIMEOUT_MS });
  await expect(entry).toContainText('The fake failed this request');

  await entry.getByRole('button', { name: 'Retry' }).click();
  await expect(workerPage.getByRole('region', { name: 'History' }).getByRole('article', { name: model.name })).toHaveCount(2);
  await expect.poll(async () => (await falRequests(stack)).filter((request) => request.input.prompt === prompt).length).toBe(2);
});

/** The model's only Output row, as stored. */
async function onlyOutput(db: TestDb, model: SeededModel) {
  const [row] = await db
    .select({ id: generationOutput.id, s3Key: generationOutput.s3Key, expiredAt: generationOutput.expiredAt })
    .from(generationOutput)
    .innerJoin(generation, eq(generation.id, generationOutput.generationId))
    .where(eq(generation.modelId, model.id));
  return row!;
}

test('Save to Files moves the Output into Files', async ({ workerPage, db, stack, bucket }) => {
  const model = await seedStudioModel(db, stack, { label: 'Keeper', endpointId: 'fake/image' });

  await openStudio(workerPage, model);
  await generate(workerPage, uniquePrefix('a kept moon'));
  await expectDone(workerPage, model);
  const studioKey = (await onlyOutput(db, model)).s3Key;
  const entry = historyEntry(workerPage, model);
  await entry.getByRole('button', { name: 'Save to Files' }).click();
  await expect(workerPage.getByText('Saved to Files').first()).toBeVisible();
  await expect(entry.getByRole('link', { name: 'Saved to Files' })).toBeVisible();

  // Moved, not copied: the Output now points at the file's object, and its own is gone.
  await expect.poll(async () => (await onlyOutput(db, model)).s3Key).not.toBe(studioKey);
  await expect(bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: studioKey }))).rejects.toThrow();

  await openOwnFiles(workerPage, model.name, 1);
  await expect(workerPage.getByRole('button', { name: `${model.name} 1.png`, exact: true })).toBeVisible();
});

test('Delete removes a Generation from the history and its Output from storage', async ({ workerPage, db, stack, bucket }) => {
  const model = await seedStudioModel(db, stack, { label: 'Discard', endpointId: 'fake/image' });

  await openStudio(workerPage, model);
  await generate(workerPage, uniquePrefix('a discarded idea'));
  await expectDone(workerPage, model);
  const output = await onlyOutput(db, model);

  await historyEntry(workerPage, model).getByRole('button', { name: 'Delete' }).click();
  await workerPage.getByRole('dialog', { name: 'Delete this Generation?' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(workerPage.getByRole('region', { name: 'History' }).getByRole('article', { name: model.name })).toHaveCount(0);
  await expect.poll(async () => (await onlyOutput(db, model)).expiredAt).not.toBeNull();
  await expect(bucket.client.send(new HeadObjectCommand({ Bucket: bucket.name, Key: output.s3Key }))).rejects.toThrow();
});

test('Again on a Generation whose upload fal deleted opens its settings to attach the file anew', async ({
  workerPage,
  db,
  stack,
  corpus,
}) => {
  const model = await seedStudioModel(db, stack, { label: 'Animate upload', endpointId: 'fake/video', icon: 'Video' });
  const prompt = uniquePrefix('a waving flag');

  await openStudio(workerPage, model);
  await workerPage.getByLabel('Image Url').setInputFiles(corpus.file('square-food.png').path);
  await generate(workerPage, prompt);
  await expectDone(workerPage, model);

  // fal keeps uploads for a day; here that day has passed.
  const [stored] = await db
    .select({ id: generation.id, formValues: generation.formValues })
    .from(generation)
    .where(eq(generation.modelId, model.id));
  const { id, formValues } = stored!;
  expect(formValues.image_url).toMatchObject({ source: 'url' });
  const expired = { ...(formValues.image_url as object), expiresAt: new Date(Date.now() - 1000).toISOString() };
  await db
    .update(generation)
    .set({ formValues: { ...formValues, image_url: expired } as typeof formValues })
    .where(eq(generation.id, id));

  await openStudio(workerPage, model);
  await workerPage.getByRole('textbox', { name: 'Prompt', exact: true }).fill('something else');
  await historyEntry(workerPage, model).getByRole('button', { name: 'Again' }).click();
  await expect(workerPage.getByText('A file uploaded for this Generation has expired. Attach it again.')).toBeVisible();
  await expect(workerPage.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue(prompt);
  await expect(workerPage.getByRole('region', { name: 'History' }).getByRole('article', { name: model.name })).toHaveCount(1);
});

test('a Generation finishing elsewhere raises a toast and the nav badge on /dashboard, cleared by viewing the history', async ({
  workerPage,
  db,
  stack,
}) => {
  const model = await seedStudioModel(db, stack, { label: 'Elsewhere', endpointId: 'fake/image' });
  const prompt = `${uniquePrefix('while away')} [slow]`;
  const studioLink = workerPage.getByRole('navigation').getByRole('link', { name: /^Studio/ });

  await openStudio(workerPage, model);
  await expect(studioLink).toHaveAccessibleName('Studio');
  await generate(workerPage, prompt);
  const request = await falRequestContaining(stack, prompt);
  await expect(historyEntry(workerPage, model).getByText('Running')).toBeVisible({ timeout: FINISH_TIMEOUT_MS });

  // The event stream connects after hydration; release only once the page opened it.
  const listening = workerPage.waitForRequest((sent) => sent.url().endsWith('/api/studio/events'));
  await workerPage.goto('/dashboard');
  await listening;
  await expect(studioLink).toHaveAccessibleName('Studio');
  await releaseFalRequest(stack, request.request_id);

  const toast = workerPage.locator('[data-sonner-toast]').filter({ hasText: 'Image ready' });
  await expect(toast).toContainText(model.name, { timeout: FINISH_TIMEOUT_MS });
  await expect(studioLink).toHaveAccessibleName(/^Studio\s*1 new$/);

  await toast.getByRole('button', { name: 'View' }).click();
  await expect(workerPage).toHaveURL(/\/studio/);
  await expect(studioLink).toHaveAccessibleName('Studio');
});
