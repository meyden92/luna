import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import {
  createEditingModelThroughAdmin,
  createGlobalVariableThroughAdmin,
  deleteEditingModelThroughAdmin,
  deleteGlobalVariableThroughAdmin,
} from '../utils/admin-config';
import { untilHydrated } from '../utils/hydration';
import { uniquePrefix } from '../utils/own-files';

// Templates are shared by every user of the Generate screen. These tests make their own editing model and
// global variable (so nothing else depends on them), and never use the template's test-generate, which would
// call the provider.

const uniqueName = (prefix: string) => uniquePrefix(prefix).replace('-', '_');

/** Opens the create form and fills what every template needs; the prompt is left to the caller. */
async function startTemplate(page: Page, template: { name: string; model: string; prompt: string }): Promise<void> {
  await page.goto('/admin/templates/create');
  const nameField = page.getByLabel('Template Name');
  await untilHydrated(nameField);
  await nameField.fill(template.name);
  await page.getByRole('combobox', { name: 'Base Model' }).click();
  await page.getByRole('option', { name: template.model }).click();
  await page.getByPlaceholder(/A cinematic shot of/).fill(template.prompt);
}

test('a template using a global variable is created, edited and deleted', async ({ adminPage }) => {
  const model = uniquePrefix('E2E tpl model');
  const variable = uniqueName('e2e_tone');
  const name = uniquePrefix('E2E template');
  const renamed = `${name} (edited)`;
  await createEditingModelThroughAdmin(adminPage, model, 'e2e/template-model');
  await createGlobalVariableThroughAdmin(adminPage, { name: variable, label: 'E2E tone' });

  await startTemplate(adminPage, { name, model, prompt: `A portrait in a {${variable}} mood` });
  await adminPage.getByLabel('Description').fill('Made by the templates spec');
  await adminPage.getByRole('button', { name: 'Link Global', exact: true }).click();
  await adminPage.getByRole('menuitem', { name: `E2E tone (${variable})` }).click();
  await expect(adminPage.getByText('All variables are properly configured')).toBeVisible();
  await adminPage.getByRole('button', { name: 'Create Template' }).click();

  await expect(adminPage.getByText('Template created successfully')).toBeVisible();
  await expect(adminPage).toHaveURL(/\/admin\/templates$/);
  const card = adminPage.getByRole('group', { name, exact: true });
  await expect(card).toContainText('Created by E2E Admin');

  // The global variable now reports its use.
  await adminPage.goto('/admin/global-variables');
  await expect(adminPage.getByRole('row').filter({ hasText: variable })).toContainText('1 templates');

  await adminPage.goto('/admin/templates');
  await adminPage.getByRole('link', { name: `Edit ${name}` }).click();
  const nameField = adminPage.getByLabel('Template Name');
  await untilHydrated(nameField);
  await expect(nameField).toHaveValue(name);
  await expect(adminPage.getByPlaceholder(/A cinematic shot of/)).toHaveValue(`A portrait in a {${variable}} mood`);
  await expect(adminPage.getByText('E2E tone', { exact: true }).first()).toBeVisible();
  await nameField.fill(renamed);
  await adminPage.getByPlaceholder(/A cinematic shot of/).fill(`A portrait with a {${variable}} feeling`);
  await adminPage.getByRole('button', { name: 'Save Changes' }).click();

  await expect(adminPage.getByText('Template updated successfully')).toBeVisible();
  await expect(adminPage.getByRole('link', { name: `Edit ${renamed}` })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: `Edit ${name}`, exact: true })).toHaveCount(0);

  await adminPage.getByRole('button', { name: `Delete ${renamed}` }).click();
  const dialog = adminPage.getByRole('alertdialog', { name: 'Delete Template' });
  await expect(dialog).toContainText(renamed);
  await dialog.getByRole('button', { name: 'Delete Template' }).click();
  await expect(adminPage.getByText('Template deleted successfully')).toBeVisible();
  await expect(adminPage.getByRole('link', { name: `Edit ${renamed}` })).toHaveCount(0);

  await deleteGlobalVariableThroughAdmin(adminPage, variable);
  await deleteEditingModelThroughAdmin(adminPage, model);
});

test('a prompt with an undefined variable or a dropdown without options is rejected', async ({ adminPage }) => {
  const model = uniquePrefix('E2E tpl model');
  const dropdown = uniqueName('e2e_pick');
  const name = uniquePrefix('E2E rejected');
  await createEditingModelThroughAdmin(adminPage, model, 'e2e/template-model');
  await createGlobalVariableThroughAdmin(adminPage, { name: dropdown, label: 'E2E pick', type: 'Dropdown' });
  const toast = adminPage.getByRole('region', { name: /^Notifications/ });

  await startTemplate(adminPage, { name, model, prompt: 'A portrait of {nothing_here} please' });
  await expect(adminPage.getByText('Undefined variables in prompt: nothing_here').first()).toBeVisible();
  await adminPage.getByRole('button', { name: 'Create Template' }).click();
  await expect(toast.getByText('Undefined variables in prompt: nothing_here')).toBeVisible();

  await adminPage.getByPlaceholder(/A cinematic shot of/).fill(`A portrait of a {${dropdown}} kind`);
  await adminPage.getByRole('button', { name: 'Link Global', exact: true }).click();
  await adminPage.getByRole('menuitem', { name: `E2E pick (${dropdown})` }).click();
  await adminPage.getByRole('button', { name: 'Create Template' }).click();
  await expect(toast.getByText(`Invalid dropdown configuration for: ${dropdown}`)).toBeVisible();

  await adminPage.goto('/admin/templates');
  await expect(adminPage.getByRole('link', { name: `Edit ${name}` })).toHaveCount(0);

  await deleteGlobalVariableThroughAdmin(adminPage, dropdown);
  await deleteEditingModelThroughAdmin(adminPage, model);
});
