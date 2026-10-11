import { expect, type Locator, type Page } from '@playwright/test';
import { untilHydrated } from './hydration';

/** The card of a model on /admin/models, a group named by the model's label. */
export const modelCard = (page: Page, label: string): Locator => page.getByRole('group', { name: label, exact: true });

/** Adds an editing model through its form (`/admin/models/editing/new`) and waits for it to be listed. Nothing is generated. */
export async function createEditingModelThroughAdmin(page: Page, label: string, apiModelName: string): Promise<void> {
  await page.goto('/admin/models/editing/new');
  const labelField = page.getByLabel('Display Label');
  await untilHydrated(labelField);
  await labelField.fill(label);
  await page.getByLabel('API Model Name').fill(apiModelName);
  await page.getByRole('button', { name: 'Save Model' }).click();
  await expect(page.getByText('Model created successfully')).toBeVisible();
  await expect(modelCard(page, label)).toBeVisible();
}

/** Deletes an editing model from the Editing Models tab, confirming its dialog. */
export async function deleteEditingModelThroughAdmin(page: Page, label: string): Promise<void> {
  await page.goto('/admin/models?tab=editing');
  await expect(modelCard(page, label)).toBeVisible();
  await page.getByRole('button', { name: `Delete ${label}` }).click();
  await page.getByRole('dialog', { name: 'Delete Editing Model' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Editing model deleted successfully')).toBeVisible();
  await expect(page.getByText(label, { exact: true })).toHaveCount(0);
}

/**
 * Creates a global variable through its form and waits for its row. `type` defaults to text; a dropdown is
 * created without options. Remove it with `deleteGlobalVariableThroughAdmin`.
 */
export async function createGlobalVariableThroughAdmin(
  page: Page,
  variable: { name: string; label: string; type?: 'Text' | 'Dropdown' },
): Promise<void> {
  await page.goto('/admin/global-variables/new');
  const nameField = page.getByLabel('Variable Name (ID)');
  await untilHydrated(nameField);
  await nameField.fill(variable.name);
  await page.getByLabel('Display Label').fill(variable.label);
  if (variable.type && variable.type !== 'Text') {
    await page.getByLabel('Type').click();
    await page.getByRole('option', { name: variable.type }).click();
  }
  await page.getByRole('button', { name: 'Create Variable' }).click();
  await expect(page.getByText('Variable created')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: variable.name })).toBeVisible();
}

/** Deletes a global variable from the list, confirming its dialog. */
export async function deleteGlobalVariableThroughAdmin(page: Page, name: string): Promise<void> {
  await page.goto('/admin/global-variables');
  await page.getByRole('button', { name: `Delete ${name}` }).click();
  await page.getByRole('alertdialog', { name: 'Delete Global Variable?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Global variable deleted')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);
}
