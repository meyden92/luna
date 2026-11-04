import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';
import { generation } from '../../../../src/db/schema/studio';
import { test } from '../../fixtures/test';
import type { StackEnv } from '../../stack-env';
import { userIdOf } from '../../utils/admin-users';
import { type FalRequestRecord, falRequestContaining, falUploads } from '../../utils/fal-fake';
import { untilHydrated } from '../../utils/hydration';
import { uniquePrefix } from '../../utils/own-files';
import { historyEntry, openStudio, type SeededModel, seedStudioModel } from '../../utils/studio';

// Studio Templates: a fake/edit Model with a fixed prompt holding inline
// Variables and two file Variables feeding its image list, built in the
// editor, test-run, then run by a User in the Studio. The fake's recorded
// requests show what substitution sent. Models and Templates are global, so
// every name carries a uniquePrefix.

const FINISH_TIMEOUT_MS = 30_000;

/** Picks `option` from the Select labelled `label` inside `scope`. */
async function choose(page: Page, scope: Locator | Page, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

/** The file name the app uploaded to fal storage for an input URL. */
async function uploadedName(stack: StackEnv, url: unknown): Promise<string | undefined> {
  return (await falUploads(stack)).find((upload) => upload.file_url === url)?.file_name;
}

async function expectImages(stack: StackEnv, sent: FalRequestRecord, names: string[]) {
  const urls = sent.input.image_urls as unknown[];
  expect(urls).toHaveLength(names.length);
  for (const [position, name] of names.entries()) expect(await uploadedName(stack, urls[position])).toBe(name);
}

/** Builds and saves the Template; returns its id. */
async function buildTemplate(
  page: Page,
  stack: StackEnv,
  model: SeededModel,
  { name, prefix, files }: { name: string; prefix: string; files: [string, string] },
): Promise<string> {
  await page.goto('/admin/studio/templates/new');
  await expect(page).toHaveTitle('New studio template | LunaShare');
  await untilHydrated(page.getByLabel('Name', { exact: true }));
  await page.getByLabel('Name', { exact: true }).fill(name);
  await choose(page, page, 'Model', model.name);

  // The prompt is fixed by default and takes Variables; each name gets a card, and loses it with the text.
  const prompt = region(page, 'Field prompt');
  await expect(prompt.getByRole('button', { name: 'Fixed' })).toHaveAttribute('aria-pressed', 'true');
  const text = prompt.getByLabel('Value', { exact: true });
  await text.fill(`${prefix} Turn the person into {style: Anime | *Comic} {extra}, {mood}`);
  for (const variable of ['style', 'extra', 'mood']) await expect(region(page, `Variable ${variable}`)).toBeVisible();
  await expect(region(page, 'Variable style').getByLabel('Kind of style')).toContainText('Choice');
  await text.fill(`${prefix} Turn the person into {style: Anime | *Comic} {extra}`);
  await expect(region(page, 'Variable mood')).toHaveCount(0);

  // Options: relabel one, and change what the other inserts, which writes back to the text.
  const style = region(page, 'Variable style');
  await style.getByLabel('Label for Comic').fill('Comic book');
  await style.getByLabel('Value of option 1').fill('anime style, cel shaded');
  await style.getByLabel('Label for anime style, cel shaded').fill('Anime');
  await expect(text).toHaveValue(`${prefix} Turn the person into {style: anime style, cel shaded | *Comic} {extra}`);

  // Two file inputs feed fake/edit's image list, at positions 1 and 2.
  await page.getByRole('button', { name: 'Add file input' }).click();
  await page.getByRole('button', { name: 'Add file input' }).click();
  const person = region(page, 'Variable file');
  const outfit = region(page, 'Variable file_2');
  await person.getByLabel('Label', { exact: true }).fill('Photo of the person');
  await outfit.getByLabel('Label', { exact: true }).fill('Photo of the outfit');
  await expect(person.getByLabel('Feeds input')).toContainText('image_urls');
  await expect(person.getByLabel('Position')).toHaveValue('1');
  await expect(outfit.getByLabel('Position')).toHaveValue('2');
  const images = region(page, 'Field image_urls');
  await expect(images.getByText('Fed by the file Variable file, file_2.')).toBeVisible();
  await expect(images.getByRole('button', { name: 'fal default' })).toHaveAttribute('aria-pressed', 'true');

  // The preview is the Users' form: the choice shows labels, the default picked.
  const preview = page.getByTestId('studio-preview');
  const choice = preview.getByRole('group', { name: 'Style' });
  await expect(choice.getByRole('button')).toHaveText(['Anime', 'Comic book']);
  await expect(choice.getByRole('button', { name: 'Comic book' })).toHaveAttribute('aria-pressed', 'true');

  // Test with the other choice: the request gets its value and the files in their positions.
  await choice.getByRole('button', { name: 'Anime' }).click();
  await preview.getByLabel('Extra', { exact: true }).fill('in a test run');
  await preview.getByLabel('Photo of the person').setInputFiles(files[0]);
  await preview.getByLabel('Photo of the outfit').setInputFiles(files[1]);
  await preview.getByRole('button', { name: 'Test' }).click();
  const result = preview.getByTestId('studio-test-result');
  await expect(result).toContainText('Test succeeded', { timeout: FINISH_TIMEOUT_MS });
  const tested = await falRequestContaining(stack, `${prefix} Turn the person into anime style`);
  expect(tested).toMatchObject({
    endpoint_id: 'fake/edit',
    input: { prompt: `${prefix} Turn the person into anime style, cel shaded in a test run` },
  });

  // The test's Output becomes the preview image; saving creates the Template.
  await result.getByRole('button', { name: 'Use as preview' }).click();
  await expect(page.getByRole('list', { name: 'Preview images' }).getByRole('img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Template saved')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/studio\/templates\/[0-9a-f-]+$/);
  const id = new URL(page.url()).pathname.split('/').pop() as string;

  await page.reload();
  await expect(region(page, 'Variable style').getByLabel('Label for Comic')).toHaveValue('Comic book');
  await expect(region(page, 'Field prompt').getByLabel('Value', { exact: true })).toHaveValue(
    `${prefix} Turn the person into {style: anime style, cel shaded | *Comic} {extra}`,
  );
  return id;
}

test('a Template with inline Variables is built, test-run and run in the Studio with the substituted prompt and images', async ({
  adminPage,
  workerPage,
  db,
  stack: stackEnv,
  corpus,
}) => {
  const model = await seedStudioModel(db, stackEnv, { label: 'Bearbeiten', endpointId: 'fake/edit' });
  const name = uniquePrefix('Comicfigur');
  const prefix = uniquePrefix('template');
  const personFile = corpus.file('portrait-tall.webp');
  const outfitFile = corpus.file('square-food.png');
  const id = await buildTemplate(adminPage, stackEnv, model, { name, prefix, files: [personFile.path, outfitFile.path] });

  await adminPage.goto('/admin/studio/templates');
  await expect(adminPage.getByRole('row').filter({ hasText: name })).toContainText(model.name);

  // A User runs it: the card shows the preview, the form only the Variables.
  await workerPage.goto(`/studio?category=${model.categoryId}&template=${id}`);
  await expect(workerPage.getByRole('heading', { name })).toBeVisible();
  await expect(
    workerPage.getByRole('toolbar', { name: 'Models and Templates' }).getByRole('button', { name }).locator('img'),
  ).toBeVisible();
  const form = workerPage.getByRole('region', { name: 'Generate' });
  await untilHydrated(form.getByRole('button', { name: 'Generate' }));
  await expect(form.getByRole('textbox', { name: 'Prompt' })).toHaveCount(0);
  await expect(form.getByRole('group', { name: 'Style' }).getByRole('button', { name: 'Comic book' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await form.getByLabel('Extra', { exact: true }).fill('with a hat');
  await form.getByLabel('Photo of the person').setInputFiles(personFile.path);
  await form.getByLabel('Photo of the outfit').setInputFiles(outfitFile.path);
  await form.getByRole('button', { name: 'Generate' }).click();

  const sent = await falRequestContaining(stackEnv, `${prefix} Turn the person into Comic`);
  expect(sent).toMatchObject({ endpoint_id: 'fake/edit', input: { prompt: `${prefix} Turn the person into Comic with a hat` } });
  await expectImages(stackEnv, sent, [personFile.name, outfitFile.name]);

  const entry = workerPage.getByRole('region', { name: 'History' }).getByRole('article', { name }).first();
  await expect(entry.getByText('Done', { exact: true })).toBeVisible({ timeout: FINISH_TIMEOUT_MS });
  await expect(entry.getByRole('link', { name: 'Save as Template' })).toHaveCount(0);
});

test('Save as Template starts a Template from a Generation, and explains when its Model is gone', async ({ adminPage, db, stack }) => {
  const model = await seedStudioModel(db, stack, { label: 'Vorlage', endpointId: 'fake/image' });
  const prompt = uniquePrefix('a lighthouse at dusk');
  await openStudio(adminPage, model);
  await adminPage.getByRole('textbox', { name: 'Prompt', exact: true }).fill(prompt);
  await adminPage.getByRole('button', { name: 'Generate' }).click();
  const entry = historyEntry(adminPage, model);
  await expect(entry.getByText('Done', { exact: true })).toBeVisible({ timeout: FINISH_TIMEOUT_MS });

  await entry.getByRole('link', { name: 'Save as Template' }).click();
  await expect(adminPage).toHaveURL(/\/admin\/studio\/templates\/new\?from=/);
  await expect(adminPage.getByLabel('Model', { exact: true })).toContainText(model.name);
  await expect(adminPage.getByLabel('Name', { exact: true })).toHaveValue(model.name);
  await expect(region(adminPage, 'Field prompt').getByLabel('Value', { exact: true })).toHaveValue(prompt);
  await expect(adminPage.getByRole('list', { name: 'Preview images' }).getByRole('img')).toHaveCount(1);
  const name = uniquePrefix('Leuchtturm');
  await adminPage.getByLabel('Name', { exact: true }).fill(name);
  await adminPage.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(adminPage.getByText('Template saved')).toBeVisible();
  await expect(adminPage).toHaveURL(/\/admin\/studio\/templates\/[0-9a-f-]+$/);

  // A Generation whose Model was deleted cannot become a Template.
  const orphan = randomUUID();
  await db.insert(generation).values({
    id: orphan,
    userId: await userIdOf(db, stack.E2E_ADMIN_EMAIL),
    name: uniquePrefix('Gone'),
    endpointId: 'fake/image',
    formValues: { prompt: 'gone' },
    status: 'succeeded',
    completedAt: new Date(),
  });
  await adminPage.goto(`/admin/studio/templates/new?from=${orphan}`);
  await expect(adminPage.getByRole('alert')).toHaveText('The Model of this Generation no longer exists, so it cannot become a Template.');
});

test('the Template admin pages are for admins only', async ({ workerPage }) => {
  for (const path of ['/admin/studio/templates', '/admin/studio/templates/new']) {
    await workerPage.goto(path);
    await expect(workerPage).toHaveURL(/\/unauthorized/);
  }
});
