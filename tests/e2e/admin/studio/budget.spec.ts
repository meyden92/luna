import { expect, type Page } from '@playwright/test';
import { formatUsd } from '../../../../src/libs/studio/format';
import { test } from '../../fixtures/test';
import { FAKE_BALANCE_USD } from '../../stack/fal-fake/catalog';
import { createUserThroughAdmin, signedInDevice, throwawayUser, userIdOf } from '../../utils/admin-users';
import { falRequestContaining, releaseFalRequest } from '../../utils/fal-fake';
import { clickUntil } from '../../utils/hydration';
import { uniquePrefix } from '../../utils/own-files';
import { historyEntry, openStudio, type SeededModel, seedStudioModel } from '../../utils/studio';

// Budgets, cost settlement and the admin overview. The default Budget applies to every User, so this file runs in the
// `instance-wide` project after the rest of the suite (playwright.config.ts), one test after another, and puts the
// default back to unlimited.

test.describe.configure({ mode: 'serial' });

const FINISH_TIMEOUT_MS = 30_000;

async function generate(page: Page, prompt: string) {
  await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill(prompt);
  await page.getByRole('button', { name: 'Generate' }).click();
}

async function expectDone(page: Page, model: SeededModel, prompt: string) {
  const entry = page.getByRole('region', { name: 'History' }).getByRole('article', { name: model.name }).filter({ hasText: prompt });
  await expect(entry.getByText('Done')).toBeVisible({ timeout: FINISH_TIMEOUT_MS });
}

async function setDefaultBudget(adminPage: Page, value: string) {
  await adminPage.goto('/admin/studio/settings');
  await expect(adminPage).toHaveTitle('Studio settings | LunaShare');
  const field = adminPage.getByLabel('Default monthly Budget (USD)');
  await field.fill(value);
  await clickUntil(adminPage.getByRole('button', { name: 'Save settings' }), adminPage.getByText('Studio settings saved'));
  await adminPage.reload();
  await expect(field).toHaveValue(value);
}

test('a small default Budget refuses the Generation that no longer fits, and an unlimited Budget lifts it', async ({
  adminPage,
  browser,
  db,
  stack,
}) => {
  const model = await seedStudioModel(db, stack, { label: 'Budget', endpointId: 'fake/image' });
  const account = throwawayUser('budget');
  await adminPage.goto('/admin/users');
  await createUserThroughAdmin(adminPage, account);
  const userId = await userIdOf(db, account.email);
  const userPage = await signedInDevice(browser, account);

  try {
    await setDefaultBudget(adminPage, '0.05');

    await openStudio(userPage, model);
    await expect(userPage.getByTestId('studio-budget')).toHaveText('0 of 0.05 $');
    const first = uniquePrefix('first');
    await generate(userPage, first);
    await expectDone(userPage, model, first);
    await expect(userPage.getByTestId('studio-budget')).toHaveText('0.03 of 0.05 $');

    // 0.03 + 0.03 is over 0.05: refused before anything reaches fal.
    const second = uniquePrefix('second');
    await generate(userPage, second);
    await expect(userPage.getByRole('region', { name: 'Generate' }).getByRole('alert')).toHaveText(
      'This would cost about 0.03 $, but only 0.02 $ of your monthly Budget is left.',
    );

    await adminPage.goto(`/admin/users/${userId}`);
    await expect(adminPage.getByTestId('user-studio-spend')).toHaveText('0.03 of 0.05 $');
    await clickUntil(
      adminPage.getByRole('button', { name: 'Unlimited' }),
      adminPage.getByRole('button', { name: 'Unlimited', pressed: true }),
    );
    await adminPage.getByRole('button', { name: 'Save Budget' }).click();
    await expect(adminPage.getByText('Studio Budget saved')).toBeVisible();
    await expect(adminPage.getByTestId('user-studio-spend')).toHaveText('0.03 $ spent, unlimited');

    await openStudio(userPage, model);
    await expect(userPage.getByTestId('studio-budget')).toHaveText('0.03 $ spent, unlimited');
    await generate(userPage, second);
    await expectDone(userPage, model, second);
  } finally {
    await userPage.context().close();
    await setDefaultBudget(adminPage, '');
  }
});

test('settlement books what fal billed, and the overview shows it with the fal balance', async ({ adminPage, workerPage, db, stack }) => {
  const model = await seedStudioModel(db, stack, { label: 'Billed', endpointId: 'fake/image' });
  const prompt = `${uniquePrefix('billed')} [cost=1.2345]`;

  await openStudio(workerPage, model);
  await expect(workerPage.getByTestId('studio-estimate')).toHaveText('≈ 0.03 $');
  await generate(workerPage, prompt);
  await expectDone(workerPage, model, prompt);

  await adminPage.goto('/admin/tasks');
  const task = adminPage.getByRole('row').filter({ hasText: 'settle-studio-costs' });
  await clickUntil(task.getByRole('button', { name: 'Execute Now' }), adminPage.getByText('Task executed successfully'));

  await adminPage.goto('/admin/studio/overview');
  await expect(adminPage).toHaveTitle('Studio overview | LunaShare');
  const perModel = adminPage.getByRole('table', { name: 'Spend per Model' }).getByRole('row').filter({ hasText: model.name });
  await expect(perModel).toContainText('1.2345 $');
  await expect(adminPage.getByText(formatUsd(FAKE_BALANCE_USD), { exact: true })).toBeVisible();

  // The User's history shows the billed cost, no longer the estimate.
  await openStudio(workerPage, model);
  await expect(historyEntry(workerPage, model)).toContainText('· 1.2345 $');
});

test("a failed Generation shows its input and fal's error to admins; a successful one keeps its prompt private", async ({
  adminPage,
  workerPage,
  db,
  stack,
}) => {
  const model = await seedStudioModel(db, stack, { label: 'Watched', endpointId: 'fake/image' });
  const succeeded = uniquePrefix('private lighthouse');
  const failed = `${uniquePrefix('broken')} [fail]`;
  const slow = `${uniquePrefix('slow')} [slow]`;

  await openStudio(workerPage, model);
  await generate(workerPage, succeeded);
  await expectDone(workerPage, model, succeeded);
  await generate(workerPage, failed);
  const failedEntry = workerPage
    .getByRole('region', { name: 'History' })
    .getByRole('article', { name: model.name })
    .filter({ hasText: failed });
  await expect(failedEntry.getByText('Failed', { exact: true })).toBeVisible({ timeout: FINISH_TIMEOUT_MS });
  await generate(workerPage, slow);
  const held = await falRequestContaining(stack, slow);

  try {
    await adminPage.goto('/admin/studio/overview');
    await expect(
      adminPage.getByRole('table', { name: 'Running Generations' }).getByRole('row').filter({ hasText: model.name }),
    ).toBeVisible();
    const rate = adminPage.getByRole('table', { name: 'Failure rate per Model' }).getByRole('row').filter({ hasText: model.name });
    await expect(rate.getByRole('cell')).toHaveText([model.name, '2', '1', '50%']);

    const failure = adminPage.getByRole('article', { name: `Failed ${model.name}` });
    await expect(failure).toContainText('The fake failed this request');
    await expect(failure).toContainText('fake_failure');
    await failure.getByText('Input', { exact: true }).click();
    await expect(failure.getByText(failed).first()).toBeVisible();

    await expect(adminPage.locator('body')).not.toContainText(succeeded);
  } finally {
    await releaseFalRequest(stack, held.request_id);
  }
});
