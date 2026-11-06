import { expect, type Locator, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { generation } from '../../../../src/db/schema/studio';
import { test } from '../../fixtures/test';
import { userIdOf } from '../../utils/admin-users';
import { falRequestContaining } from '../../utils/fal-fake';
import { clickUntil } from '../../utils/hydration';
import { uniquePrefix } from '../../utils/own-files';

// The Studio admin: Categories, and a Model added from the fake fal catalog,
// configured through its Field cards, previewed and test-run. Categories and
// Models are global, so every name carries a uniquePrefix and assertions look
// only at the rows a test made.

const categoryRow = (page: Page, name: string) => page.getByTestId('studio-category').filter({ hasText: name });

async function createCategory(page: Page, name: string): Promise<Locator> {
  await page.goto('/admin/studio/categories');
  const dialog = page.getByRole('dialog', { name: 'New category' });
  await clickUntil(page.getByRole('button', { name: 'New category' }), dialog);
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Video', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  const row = categoryRow(page, name);
  await expect(row).toBeVisible();
  return row;
}

/** Picks `option` from the Select labelled `label` inside `scope`. */
async function choose(page: Page, scope: Locator, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('admins create, rename, reorder and delete Categories; a Category with Models is not deleted', async ({ adminPage }) => {
  const first = uniquePrefix('Bilder');
  const second = uniquePrefix('Videos');
  await createCategory(adminPage, first);
  const secondRow = await createCategory(adminPage, second);

  // Drag the second Category by its handle onto the first one's place.
  const rows = adminPage.getByTestId('studio-category');
  const handle = await secondRow.getByRole('button', { name: 'Drag to reorder' }).boundingBox();
  const target = await categoryRow(adminPage, first).boundingBox();
  await adminPage.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await adminPage.mouse.down();
  await adminPage.mouse.move(handle!.x + handle!.width / 2, target!.y + 2, { steps: 20 });
  const saved = adminPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/_serverFn/'));
  await adminPage.mouse.up();
  await saved;
  await adminPage.reload();
  const order = await rows.allTextContents();
  expect(order.findIndex((text) => text.includes(second))).toBeLessThan(order.findIndex((text) => text.includes(first)));

  const renamed = `${first} neu`;
  const dialog = adminPage.getByRole('dialog', { name: 'Edit category' });
  await clickUntil(categoryRow(adminPage, first).getByRole('button', { name: `Edit ${first}` }), dialog);
  await dialog.getByLabel('Name').fill(renamed);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(categoryRow(adminPage, renamed)).toBeVisible();

  await categoryRow(adminPage, renamed)
    .getByRole('button', { name: `Delete ${renamed}` })
    .click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(adminPage.getByText('Category deleted')).toBeVisible();
  await expect(categoryRow(adminPage, renamed)).toHaveCount(0);

  // A Category that holds a Model is refused.
  await addFakeImageModel(adminPage, second, uniquePrefix('Blocker'));
  await adminPage.goto('/admin/studio/categories');
  await expect(categoryRow(adminPage, second)).toContainText('1 Model · 0 Templates');
  await categoryRow(adminPage, second)
    .getByRole('button', { name: `Delete ${second}` })
    .click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(adminPage.getByText(`${second} still holds 1 Model and 0 Templates. Move or delete them first.`)).toBeVisible();
  await expect(categoryRow(adminPage, second)).toBeVisible();
});

/** Adds `fake/image` through the catalog dialog and lands in its editor. */
async function addFakeImageModel(page: Page, category: string, name: string) {
  await page.goto('/admin/studio/models');
  const dialog = page.getByRole('dialog', { name: 'Add model' });
  await clickUntil(page.getByRole('button', { name: 'Add model' }), dialog);
  await dialog.getByLabel('Search the fal catalog').fill('fake');
  await dialog.getByRole('button', { name: 'Choose Fake Image' }).click();
  await choose(page, dialog, 'Category', category);
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Add model' }).click();
  await expect(page).toHaveURL(/\/admin\/studio\/models\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('the catalog search offers the fake media Models and never the text one', async ({ adminPage }) => {
  await adminPage.goto('/admin/studio/models');
  const dialog = adminPage.getByRole('dialog', { name: 'Add model' });
  await clickUntil(adminPage.getByRole('button', { name: 'Add model' }), dialog);
  await dialog.getByLabel('Search the fal catalog').fill('fake');

  for (const name of ['Fake Image', 'Fake Edit', 'Fake Video', 'Fake Audio', 'Fake 3D']) {
    await expect(dialog.getByRole('button', { name: `Choose ${name}` })).toBeVisible();
  }
  await expect(dialog.getByRole('listitem').filter({ hasText: 'fake/image' })).toContainText('text-to-image · $0.03 / image');
  await expect(dialog.getByRole('button', { name: 'Choose Fake LLM' })).toHaveCount(0);
});

test('a Model added from the catalog is configured with Field cards, previewed and test-run', async ({ adminPage, db, stack }) => {
  const category = uniquePrefix('Bild erstellen');
  const name = uniquePrefix('Bild');
  await createCategory(adminPage, category);
  await addFakeImageModel(adminPage, category, name);
  const field = (fieldName: string) => adminPage.getByRole('region', { name: `Field ${fieldName}` });
  const preview = adminPage.getByTestId('studio-preview');

  // Sensible defaults: prompt, aspect ratio and the image count shown; the seed left to fal.
  for (const shown of ['prompt', 'aspect_ratio', 'num_images']) {
    await expect(field(shown).getByRole('button', { name: 'User input' })).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(field('seed').getByRole('button', { name: 'fal default' })).toHaveAttribute('aria-pressed', 'true');
  await expect(adminPage.getByText('fal charges $0.03 / image.')).toBeVisible();

  // Relabel aspect_ratio and narrow it to two choices.
  const aspect = field('aspect_ratio');
  await aspect.getByLabel('Label', { exact: true }).fill('Seitenverhältnis');
  for (const dropped of ['9:16', '4:3', '3:4']) await aspect.getByRole('checkbox', { name: dropped }).click();
  await aspect.getByLabel('Label for 1:1').fill('Quadrat');
  await aspect.getByLabel('Label for 16:9').fill('Breit');

  // Show the image count only for wide pictures.
  const count = field('num_images');
  await choose(adminPage, count, 'Shown only when', 'aspect_ratio');
  await count.getByRole('checkbox', { name: 'Quadrat' }).click();
  await count.getByRole('checkbox', { name: 'Breit' }).click();

  // An invalid range shows its issue and blocks saving until undone.
  const save = adminPage.getByRole('button', { name: 'Save', exact: true });
  await count.getByLabel('Maximum').fill('9');
  await expect(count.getByText('The maximum cannot be above the schema maximum of 4.')).toBeVisible();
  await expect(save).toBeDisabled();
  await count.getByLabel('Maximum').fill('');
  await expect(save).toBeEnabled();

  // The preview renders the form as Users get it.
  const ratio = preview.getByRole('group', { name: 'Seitenverhältnis' });
  await expect(ratio.getByRole('button')).toHaveText(['Quadrat', 'Breit']);
  await expect(preview.getByLabel('Num Images')).toHaveCount(0);
  await ratio.getByRole('button', { name: 'Breit' }).click();
  await expect(preview.getByLabel('Num Images')).toBeVisible();

  await save.click();
  await expect(adminPage.getByText('Model saved')).toBeVisible();
  await adminPage.reload();
  await expect(field('aspect_ratio').getByLabel('Label', { exact: true })).toHaveValue('Seitenverhältnis');

  // A test run is a real Generation of the admin's, shown in the editor.
  const prompt = uniquePrefix('studio admin test');
  await preview.getByLabel('Prompt').fill(prompt);
  await preview.getByRole('group', { name: 'Seitenverhältnis' }).getByRole('button', { name: 'Breit' }).click();
  await preview.getByLabel('Num Images').fill('2');
  await preview.getByRole('button', { name: 'Test' }).click();

  const result = preview.getByTestId('studio-test-result');
  await expect(result).toContainText('Test succeeded', { timeout: 30_000 });
  await expect(result.getByRole('img')).toHaveCount(2);

  const sent = await falRequestContaining(stack, prompt);
  expect(sent).toMatchObject({ endpoint_id: 'fake/image', input: { prompt, aspect_ratio: '16:9', num_images: 2 } });
  const [row] = await db.select().from(generation).where(eq(generation.falRequestId, sent.request_id));
  expect(row).toMatchObject({ userId: await userIdOf(db, stack.E2E_ADMIN_EMAIL), name, status: 'succeeded', estimatedCostUsd: 0.06 });
});

test('the Studio admin pages are for admins only', async ({ workerPage }) => {
  for (const path of ['/admin/studio/categories', '/admin/studio/models']) {
    await workerPage.goto(path);
    await expect(workerPage).toHaveURL(/\/unauthorized/);
  }
});
