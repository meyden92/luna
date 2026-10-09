import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { createEditingModelThroughAdmin, deleteEditingModelThroughAdmin, modelCard } from '../utils/admin-config';
import { untilHydrated } from '../utils/hydration';
import { uniquePrefix } from '../utils/own-files';

// Model entries are configuration only: the app calls the provider when somebody generates, which these
// tests never do (and Replicate is not configured on the stack anyway).

/** Opens a card's Edit button and waits for the form to be ready. */
async function openEdit(page: Page, label: string): Promise<void> {
  await modelCard(page, label).getByRole('button', { name: 'Edit', exact: true }).click();
  await untilHydrated(page.getByLabel('Display Label'));
  await expect(page.getByLabel('Display Label')).toHaveValue(label);
}

test('a generation model is created, edited and deleted', async ({ adminPage }) => {
  const label = uniquePrefix('E2E generation');
  const renamed = `${label} (edited)`;

  await adminPage.goto('/admin/models/generation/new');
  const labelField = adminPage.getByLabel('Display Label');
  await untilHydrated(labelField);
  await labelField.fill(label);
  await adminPage.getByLabel('Description').fill('Created by the models spec');
  await adminPage.getByLabel('API Model Name').fill('e2e/generation-model');
  await adminPage.getByRole('button', { name: 'Add Field' }).first().click();
  await adminPage.getByPlaceholder('Enter field name').fill('strength');
  await adminPage.getByPlaceholder('Enter display label').last().fill('Strength');
  await adminPage.getByRole('button', { name: 'Save Model' }).click();

  await expect(adminPage.getByText('Model created successfully')).toBeVisible();
  const card = modelCard(adminPage, label);
  await expect(card).toContainText('Created by the models spec');
  await expect(card).toContainText('e2e/generation-model');
  await expect(card).toContainText('Fields: 1');

  await openEdit(adminPage, label);
  await expect(adminPage.getByLabel('API Model Name')).toHaveValue('e2e/generation-model');
  await adminPage.getByLabel('Display Label').fill(renamed);
  await adminPage.getByLabel('API Model Name').fill('e2e/generation-model-v2');
  await adminPage.getByRole('button', { name: 'Save Model' }).click();

  await expect(adminPage.getByText('Model updated successfully')).toBeVisible();
  await expect(modelCard(adminPage, renamed)).toContainText('e2e/generation-model-v2');
  await expect(adminPage.getByText(label, { exact: true })).toHaveCount(0);

  await adminPage.getByRole('button', { name: `Delete ${renamed}` }).click();
  await adminPage.getByRole('dialog', { name: 'Delete Model' }).getByRole('button', { name: 'Delete' }).click();
  await expect(adminPage.getByText('Model deleted successfully')).toBeVisible();
  await expect(adminPage.getByText(renamed, { exact: true })).toHaveCount(0);
});

test('an editing model is created, edited and deleted', async ({ adminPage }) => {
  const label = uniquePrefix('E2E editing');
  const renamed = `${label} (edited)`;

  await createEditingModelThroughAdmin(adminPage, label, 'e2e/editing-model');
  await expect(adminPage).toHaveURL(/tab=editing/);
  const card = modelCard(adminPage, label);
  await expect(card).toContainText('e2e/editing-model');
  await expect(card).toContainText('Fields: 0');

  await openEdit(adminPage, label);
  await expect(adminPage.getByLabel('Image Input Field')).toHaveValue('image_input');
  await adminPage.getByLabel('Display Label').fill(renamed);
  await adminPage.getByLabel('API Model Name').fill('e2e/editing-model-v2');
  await adminPage.getByRole('button', { name: 'Save Model' }).click();

  await expect(adminPage.getByText('Model updated successfully')).toBeVisible();
  await expect(modelCard(adminPage, renamed)).toContainText('e2e/editing-model-v2');

  // The generation tab does not list it.
  await adminPage.goto('/admin/models');
  await expect(adminPage.getByText(renamed, { exact: true })).toHaveCount(0);

  await deleteEditingModelThroughAdmin(adminPage, renamed);
});
