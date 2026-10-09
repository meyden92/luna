import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { untilHydrated } from '../utils/hydration';
import { uniquePrefix } from '../utils/own-files';

// Global variables are shared by every template, so each test creates its own uniquely named variable and
// removes it again.

const uniqueName = () => uniquePrefix('e2e_gv').replace('-', '_');

async function openCreateForm(page: Page): Promise<void> {
  await page.goto('/admin/global-variables/new');
  await expect(page.getByRole('heading', { name: 'Create Global Variable' })).toBeVisible();
  await untilHydrated(page.getByLabel('Variable Name (ID)'));
}

test('a variable is created, edited and deleted', async ({ adminPage }) => {
  const name = uniqueName();
  await adminPage.goto('/admin/global-variables');
  await expect(adminPage).toHaveTitle('Global Variables | LunaShare');
  await expect(adminPage.getByRole('heading', { name: 'Global Variables', exact: true })).toBeVisible();

  await openCreateForm(adminPage);
  await adminPage.getByLabel('Variable Name (ID)').fill(name);
  await adminPage.getByLabel('Display Label').fill('E2E style');
  await adminPage.getByLabel('Description').fill('Made by the admin configuration spec');
  await adminPage.getByLabel('Default Value').fill('casual');
  await adminPage.getByRole('button', { name: 'Create Variable' }).click();

  await expect(adminPage.getByText('Variable created')).toBeVisible();
  const row = adminPage.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText('E2E style');
  await expect(row).toContainText('text');
  await expect(row).toContainText('0 templates');

  await row.getByRole('link', { name: `Edit ${name}` }).click();
  await expect(adminPage.getByRole('heading', { name: 'Edit Global Variable', exact: true })).toBeVisible();
  const label = adminPage.getByLabel('Display Label');
  await untilHydrated(label);
  await expect(label).toHaveValue('E2E style');
  await expect(adminPage.getByLabel('Variable Name (ID)')).toHaveValue(name);
  await expect(adminPage.getByLabel('Default Value')).toHaveValue('casual');
  await label.fill('E2E style (edited)');
  await adminPage.getByRole('button', { name: 'Save Changes' }).click();

  await expect(adminPage.getByText('Variable updated')).toBeVisible();
  await expect(row).toContainText('E2E style (edited)');

  await row.getByRole('button', { name: `Delete ${name}` }).click();
  const dialog = adminPage.getByRole('alertdialog', { name: 'Delete Global Variable?' });
  await expect(dialog).toContainText(name);
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(adminPage.getByText('Global variable deleted')).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('invalid names and empty labels are rejected, and so is a name that is already taken', async ({ adminPage }) => {
  const name = uniqueName();
  await openCreateForm(adminPage);
  const nameField = adminPage.getByLabel('Variable Name (ID)');
  const submit = adminPage.getByRole('button', { name: 'Create Variable' });

  await nameField.fill('not valid!');
  await nameField.blur();
  await expect(adminPage.getByText('Variable name must contain only letters, numbers, and underscores')).toBeVisible();
  await expect(submit).toBeDisabled();

  await nameField.fill('');
  await nameField.blur();
  await expect(adminPage.getByText('Variable name is required')).toBeVisible();

  await nameField.fill(name);
  const label = adminPage.getByLabel('Display Label');
  await label.focus();
  await label.blur();
  await expect(adminPage.getByText('Label is required')).toBeVisible();
  await expect(submit).toBeDisabled();

  // A valid variable is created; a second with the same name (in any case) is refused.
  await label.fill('Taken');
  await submit.click();
  await expect(adminPage.getByText('Variable created')).toBeVisible();

  await openCreateForm(adminPage);
  await adminPage.getByLabel('Variable Name (ID)').fill(name.toUpperCase());
  await adminPage.getByLabel('Display Label').fill('Duplicate');
  await adminPage.getByRole('button', { name: 'Create Variable' }).click();
  await expect(adminPage.getByText('A global variable with this name already exists.')).toBeVisible();

  await adminPage.goto('/admin/global-variables');
  const row = adminPage.getByRole('row').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: `Delete ${name}` }).click();
  await adminPage.getByRole('alertdialog', { name: 'Delete Global Variable?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(adminPage.getByText('Global variable deleted')).toBeVisible();
});
