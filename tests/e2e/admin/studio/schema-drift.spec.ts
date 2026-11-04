import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { studioModel, studioTemplate } from '../../../../src/db/schema/studio';
import { templateFieldDefaults } from '../../../../src/libs/studio/template-config';
import type { FieldConfig } from '../../../../src/libs/studio/types';
import type { TestDb } from '../../fixtures/db';
import { test } from '../../fixtures/test';
import { fakeModel, type JsonObject } from '../../stack/fal-fake/catalog';
import { setFalModel } from '../../utils/fal-fake';
import { untilHydrated } from '../../utils/hydration';
import { uniquePrefix } from '../../utils/own-files';
import { historyEntry, openStudio, type SeededModel, seedStudioModel } from '../../utils/studio';

// The schema drift check: the fake serves another input schema for
// fake/drift, the check records it as pending without touching the Model,
// admins see the badge and the diff naming the affected Template, and Apply
// reconciles the configs or refuses while a fixed value became invalid.
// fake/drift is reserved for this file, and its tests share it, so they run
// one after the other and put the catalog's schema back.

test.describe.configure({ mode: 'serial' });

const ENDPOINT = 'fake/drift';
const FINISH_TIMEOUT_MS = 30_000;

/** fake/drift's catalog input with `change` applied to its properties. */
function driftedInput(change: (properties: JsonObject) => void): JsonObject {
  const input = structuredClone(fakeModel(ENDPOINT)?.input) as JsonObject;
  const properties = input.properties as JsonObject;
  change(properties);
  input['x-fal-order-properties'] = (input['x-fal-order-properties'] as string[]).filter((name) => name in properties);
  return input;
}

async function modelRow(db: TestDb, id: string) {
  const [row] = await db.select().from(studioModel).where(eq(studioModel.id, id));
  if (!row) throw new Error(`Model ${id} is gone`);
  return row;
}

const names = (fields: FieldConfig[]) => fields.map((field) => field.name);

async function openEditor(page: Page, model: SeededModel) {
  await page.goto(`/admin/studio/models/${model.id}`);
  await expect(page.getByRole('heading', { name: model.name, level: 1 })).toBeVisible();
  await untilHydrated(page.getByRole('button', { name: 'Check now' }));
}

test.beforeEach(async ({ stack }) => setFalModel(stack, ENDPOINT, {}));
test.afterAll(async ({ stack }) => setFalModel(stack, ENDPOINT, {}));

test('the daily check flags a removed input and deprecation, names the Template using it, and Apply reconciles both', async ({
  adminPage,
  workerPage,
  db,
  stack,
}) => {
  const model = await seedStudioModel(db, stack, { label: 'Drift', endpointId: ENDPOINT });
  const seeded = await modelRow(db, model.id);
  const templateName = uniquePrefix('Wide drift');
  const templateId = randomUUID();
  await db.insert(studioTemplate).values({
    id: templateId,
    categoryId: model.categoryId,
    modelId: model.id,
    name: templateName,
    fields: templateFieldDefaults(seeded.fields, seeded.schemaSnapshot.input, { prompt: 'a wide lighthouse', aspect_ratio: '16:9' }),
  });

  await setFalModel(stack, ENDPOINT, {
    input: driftedInput((properties) => delete properties.aspect_ratio),
    status: 'deprecated',
  });

  // The daily task records the drift and deprecation, and changes nothing the Studio runs with.
  await adminPage.goto('/admin/tasks');
  const task = adminPage.getByRole('row').filter({ hasText: 'check-studio-schemas' });
  await untilHydrated(task.getByRole('button', { name: 'Execute Now' }));
  await task.getByRole('button', { name: 'Execute Now' }).click();
  await expect(adminPage.getByText('Task executed successfully')).toBeVisible();
  const checked = await modelRow(db, model.id);
  expect(checked.pendingSchema?.input.properties).not.toHaveProperty('aspect_ratio');
  expect(checked.deprecated).toBe(true);
  expect(checked.schemaSnapshot).toEqual(seeded.schemaSnapshot);
  expect(checked.fields).toEqual(seeded.fields);
  expect(checked.updatedAt).toEqual(seeded.updatedAt);

  await adminPage.goto('/admin/studio/models');
  const row = adminPage.getByRole('row').filter({ hasText: model.name });
  await expect(row.getByText('Schema changed', { exact: true })).toBeVisible();
  await expect(row.getByText('Deprecated', { exact: true })).toBeVisible();

  await openEditor(adminPage, model);
  await expect(adminPage.getByText('fal marks this endpoint as deprecated. It keeps working until fal removes it.')).toBeVisible();
  const changes = adminPage.getByRole('region', { name: 'Schema changes' });
  await expect(changes.getByRole('listitem')).toContainText(['Removed input: aspect_ratio.']);
  await expect(changes).toContainText('This Model: aspect_ratio');
  await expect(changes).toContainText(`Template ${templateName}: aspect_ratio`);
  await expect(changes.getByText('Fix before applying')).toHaveCount(0);

  await adminPage.getByRole('button', { name: 'Apply' }).click();
  await expect(adminPage.getByText('Schema applied')).toBeVisible();
  await expect(changes).toHaveCount(0);
  await expect(adminPage.getByRole('region', { name: 'Field aspect_ratio' })).toHaveCount(0);

  const applied = await modelRow(db, model.id);
  expect(applied.pendingSchema).toBeNull();
  expect(applied.schemaSnapshot.input.properties).not.toHaveProperty('aspect_ratio');
  expect(names(applied.fields)).toEqual(['prompt', 'num_images', 'seed']);
  const [template] = await db.select().from(studioTemplate).where(eq(studioTemplate.id, templateId));
  expect(names(template?.fields ?? [])).toEqual(['prompt', 'num_images', 'seed']);

  await adminPage.goto('/admin/studio/models');
  await expect(row.getByText('Schema changed', { exact: true })).toHaveCount(0);
  await expect(row.getByText('Deprecated', { exact: true })).toBeVisible();

  // A deprecated Model keeps working for Users.
  const prompt = uniquePrefix('a deprecated lighthouse');
  await openStudio(workerPage, model);
  await workerPage.getByRole('textbox', { name: 'Prompt', exact: true }).fill(prompt);
  await workerPage.getByRole('button', { name: 'Generate' }).click();
  await expect(historyEntry(workerPage, model).getByText('Done')).toBeVisible({ timeout: FINISH_TIMEOUT_MS });
});

test('Check now finds a removed option, and Apply refuses until the fixed value using it is fixed', async ({ adminPage, db, stack }) => {
  const model = await seedStudioModel(db, stack, {
    label: 'Drift fixed',
    endpointId: ENDPOINT,
    fields: (defaults) => defaults.map((field) => (field.name === 'aspect_ratio' ? { ...field, mode: 'fixed', value: '16:9' } : field)),
  });
  await setFalModel(stack, ENDPOINT, {
    input: driftedInput((properties) => {
      properties.aspect_ratio = { title: 'Aspect Ratio', type: 'string', enum: ['1:1', '9:16', '4:3', '3:4'], default: '1:1' };
    }),
  });

  await openEditor(adminPage, model);
  await expect(adminPage.getByRole('region', { name: 'Schema changes' })).toHaveCount(0);
  await adminPage.getByRole('button', { name: 'Check now' }).click();
  await expect(adminPage.getByText("fal's schema differs from the snapshot")).toBeVisible();

  const changes = adminPage.getByRole('region', { name: 'Schema changes' });
  await expect(changes.getByRole('listitem').first()).toHaveText('aspect_ratio: option 16:9 removed.');
  await expect(changes).toContainText('This Model: aspect_ratio');
  await expect(changes).toContainText('This Model, aspect_ratio: The value is not one of the offered choices.');
  const apply = adminPage.getByRole('button', { name: 'Apply' });
  await expect(apply).toBeDisabled();

  // The fix is a value both schemas allow; Apply waits until it is saved.
  const ratio = adminPage.getByRole('region', { name: 'Field aspect_ratio' });
  await ratio.getByRole('group', { name: 'Aspect Ratio' }).getByRole('button', { name: '1:1' }).click();
  await expect(adminPage.getByText('Save your changes first.')).toBeVisible();
  await adminPage.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(adminPage.getByText('Model saved')).toBeVisible();
  await expect(changes.getByText('Fix before applying')).toHaveCount(0);
  await apply.click();
  await expect(adminPage.getByText('Schema applied')).toBeVisible();

  const applied = await modelRow(db, model.id);
  expect(applied.pendingSchema).toBeNull();
  expect(applied.schemaSnapshot.input.properties?.aspect_ratio?.enum).toEqual(['1:1', '9:16', '4:3', '3:4']);
  expect(applied.fields.find((field) => field.name === 'aspect_ratio')?.value).toBe('1:1');
});
