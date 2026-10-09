import { expect, type Page } from '@playwright/test';
import { test } from '../fixtures/test';
import { clickUntil } from '../utils/hydration';

// The Task Manager on /admin/tasks. Never runs `check-template-generations` (it calls the AI provider), and
// never disables or deletes the default tasks, which every other spec's stack shares.

const DEFAULT_TASKS = [
  { name: 'delete-expired-sessions', fn: 'deleteExpiredSessions', cron: '*/30 * * * *', nextRun: /\d{1,2}:(00|30):00 (AM|PM)/ },
  { name: 'prune-file-renditions', fn: 'pruneFileRenditions', cron: '0 3 * * *', nextRun: /3:00:00 AM$/ },
  { name: 'check-template-generations', fn: 'checkTemplateGenerations', cron: '*/5 * * * *', nextRun: /\d{1,2}:[0-5][05]:00 (AM|PM)/ },
];

const taskRow = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });

test('the default tasks are listed with their schedules, next runs in UTC', async ({ adminPage }) => {
  await adminPage.goto('/admin/tasks');
  await expect(adminPage).toHaveTitle('Tasks | LunaShare');
  await expect(adminPage.getByRole('heading', { name: 'Admin Tasks' })).toBeVisible();

  for (const task of DEFAULT_TASKS) {
    const row = taskRow(adminPage, task.name);
    await expect(row).toBeVisible();
    await expect(row.getByText(task.cron, { exact: true })).toBeVisible();
    await expect(row.getByText(task.fn, { exact: true })).toBeVisible();
    // The browser runs in UTC, so a cron hour of 3 is shown as 3 AM.
    await expect(row.getByRole('cell').nth(4)).toContainText(task.nextRun);
  }
});

test('the schedule preview lists the next five runs in UTC', async ({ adminPage }) => {
  await adminPage.goto('/admin/tasks');
  await clickUntil(adminPage.getByRole('button', { name: 'Create Task' }).first(), adminPage.getByText('Create New Task'));

  // The visual builder starts on a daily 00:00 schedule.
  const upcoming = adminPage.locator('p:has-text("Next 5 executions:") + div > *');
  await expect(upcoming).toHaveCount(5);
  for (const run of await upcoming.all()) await expect(run).toContainText('12:00:00 AM UTC');

  // A custom expression previews its own times.
  await adminPage.getByRole('switch', { name: 'Visual Builder' }).click();
  await adminPage.getByPlaceholder('0 0 * * * (daily at midnight)').fill('*/15 * * * *');
  await expect(upcoming).toHaveCount(5);
  await expect(adminPage.locator('code', { hasText: '*/15 * * * *' })).toBeVisible();
  for (const run of await upcoming.all()) await expect(run).toHaveText(/:(00|15|30|45):00 (AM|PM) UTC$/);
});

test('running delete-expired-sessions by hand records an execution with logs, and sessions survive', async ({ adminPage, galleryPage }) => {
  await galleryPage.goto('/dashboard');
  await expect(galleryPage).toHaveURL(/\/dashboard/);

  await adminPage.goto('/admin/tasks');
  const row = taskRow(adminPage, 'delete-expired-sessions');
  await clickUntil(row.getByRole('button', { name: 'More actions' }), adminPage.getByRole('menuitem', { name: 'View Logs' }));
  await adminPage.keyboard.press('Escape');
  await row.getByRole('button', { name: 'Execute Now' }).click();
  await expect(adminPage.getByText('Task executed successfully')).toBeVisible();

  await row.getByRole('button', { name: 'More actions' }).click();
  await adminPage.getByRole('link', { name: 'View Logs' }).click();
  await expect(adminPage.getByRole('heading', { name: 'delete-expired-sessions - Execution Logs', exact: true })).toBeVisible();
  await expect(adminPage.getByText('Status: Enabled')).toBeVisible();
  await expect(adminPage.getByText(/Triggered by: manual/).first()).toBeVisible();
  await expect(adminPage.getByText(/Result:/).first()).toBeVisible();
  await adminPage
    .getByRole('button', { name: /View logs \(\d+\)/ })
    .first()
    .click();
  await expect(adminPage.getByText('Starting task execution').first()).toBeVisible();
  await expect(adminPage.getByText(/Task completed successfully in \d+ms/).first()).toBeVisible();

  // Only expired sessions are deleted: every fixture user is still signed in.
  await galleryPage.reload();
  await expect(galleryPage).toHaveURL(/\/dashboard/);
  await adminPage.goto('/admin/tasks');
  await expect(adminPage.getByRole('heading', { name: 'Admin Tasks' })).toBeVisible();
});
