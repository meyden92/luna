import { expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { flow } from '../../../src/db/schema/automation';
import { file } from '../../../src/db/schema/files';
import { corpusUploadable } from '../fixtures/corpus';
import type { TestDb } from '../fixtures/db';
import { test } from '../fixtures/test';
import { clickUntil } from '../utils/hydration';
import { cardOf, openOwnFiles, uniquePrefix, uploadOwnFiles } from '../utils/own-files';

const sample = corpusUploadable()[0]!;

/**
 * Builds an automation on the Automations screen: "when a file is uploaded, only if its name contains `prefix`,
 * add `tags`" (and optionally make it private), turns it on and waits until the server holds it.
 * Scoping by the spec's unique prefix keeps the worker user's other uploads out of it.
 */
async function createAutomation(
  page: Page,
  db: TestDb,
  automation: { name: string; prefix: string; tags: string[]; makePrivate?: boolean },
): Promise<string> {
  await page.goto('/automations');
  await clickUntil(page.getByRole('button', { name: 'New', exact: true }), page.getByRole('button', { name: /New automation/ }).first());
  // Another automation's pane may already be open; typing waits until the new one has replaced it.
  const name = page.getByRole('textbox', { name: 'Automation name' });
  await expect(name).toHaveValue('New automation');
  await name.fill(automation.name);

  const addStep = async (item: string) => {
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByRole('menuitem', { name: item }).click();
  };

  await addStep('Only if…');
  await page.getByRole('textbox', { name: 'Text to look for' }).fill(automation.prefix);
  await addStep('Add tags');
  const tagInput = page.getByRole('textbox', { name: 'Add a tag' });
  for (const tag of automation.tags) {
    await tagInput.fill(tag);
    await tagInput.press('Enter');
    await expect(page.getByRole('button', { name: `Remove ${tag}` })).toBeVisible();
  }
  if (automation.makePrivate) await addStep('Set visibility');

  await page.getByRole('switch', { name: 'Turn this automation on or off' }).click();
  await expect(page.getByText('On', { exact: true })).toBeVisible();

  // The screen saves 600 ms after the last edit; the stored row is the proof it landed.
  let id = '';
  await expect
    .poll(async () => {
      const [row] = await db.select().from(flow).where(eq(flow.name, automation.name));
      if (!row) return false;
      id = row.id;
      const graph = JSON.stringify(row.graph);
      return row.enabled && automation.tags.every((tag) => graph.includes(`"${tag.toLowerCase()}"`)) && graph.includes(automation.prefix);
    })
    .toBe(true);
  return id;
}

async function tagsOf(db: TestDb, fileId: string): Promise<string[]> {
  const [row] = await db.select({ tags: file.tags }).from(file).where(eq(file.id, fileId));
  return row?.tags ? row.tags.split(',').filter(Boolean) : [];
}

test('an automation on upload tags and privatises a matching file, and stops when it is paused', async ({
  workerPage,
  workerRequest,
  db,
}) => {
  const prefix = uniquePrefix('auto-pause');
  await createAutomation(workerPage, db, { name: `${prefix} mark`, prefix, tags: ['e2e-marked', 'Second'], makePrivate: true });
  // A second, always-on automation tags every upload too; once its tag shows, the upload has been processed.
  await createAutomation(workerPage, db, { name: `${prefix} sentinel`, prefix, tags: ['e2e-seen'] });

  const [first] = await uploadOwnFiles(workerRequest, prefix, [sample], { titleFor: () => `${prefix} first` });
  await expect.poll(() => tagsOf(db, first!.id)).toEqual(expect.arrayContaining(['e2e-marked', 'second', 'e2e-seen']));

  await openOwnFiles(workerPage, prefix, 1);
  await expect(cardOf(workerPage, `${prefix} first`).getByTitle('Private')).toBeVisible();

  // Pause the marking automation from the list; the sentinel keeps running.
  await workerPage.goto('/automations');
  const toggle = workerPage.getByRole('switch', { name: `${prefix} mark is on` });
  await clickUntil(toggle, workerPage.getByRole('switch', { name: `${prefix} mark is paused` }));
  await expect
    .poll(
      async () =>
        (
          await db
            .select({ enabled: flow.enabled })
            .from(flow)
            .where(eq(flow.name, `${prefix} mark`))
        )[0]?.enabled,
    )
    .toBe(false);

  const [second] = await uploadOwnFiles(workerRequest, prefix, [sample], { titleFor: () => `${prefix} second` });
  await expect.poll(() => tagsOf(db, second!.id)).toEqual(['web-upload', 'e2e-seen']);
  const [row] = await db.select({ private: file.private }).from(file).where(eq(file.id, second!.id));
  expect(row?.private).toBe(false);
});

test('a deleted automation no longer runs and drops out of the list', async ({ workerPage, workerRequest, db }) => {
  const prefix = uniquePrefix('auto-delete');
  await createAutomation(workerPage, db, { name: `${prefix} mark`, prefix, tags: ['e2e-marked'] });
  await createAutomation(workerPage, db, { name: `${prefix} sentinel`, prefix, tags: ['e2e-seen'] });

  const [first] = await uploadOwnFiles(workerRequest, prefix, [sample], { titleFor: () => `${prefix} first` });
  await expect.poll(() => tagsOf(db, first!.id)).toEqual(expect.arrayContaining(['e2e-marked', 'e2e-seen']));

  await workerPage.goto('/automations');
  const mark = workerPage.getByRole('button', { name: new RegExp(`^${prefix} mark`) });
  await clickUntil(mark, workerPage.getByRole('textbox', { name: 'Automation name' }));
  await expect(workerPage.getByRole('textbox', { name: 'Automation name' })).toHaveValue(`${prefix} mark`);
  await workerPage.getByRole('button', { name: 'More' }).click();
  await workerPage.getByRole('menuitem', { name: 'Delete' }).click();
  await workerPage.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(workerPage.getByText('Automation deleted')).toBeVisible();
  await expect(mark).toHaveCount(0);

  const [second] = await uploadOwnFiles(workerRequest, prefix, [sample], { titleFor: () => `${prefix} second` });
  await expect.poll(() => tagsOf(db, second!.id)).toEqual(['web-upload', 'e2e-seen']);

  // It stays gone after a reload.
  await workerPage.reload();
  await expect(workerPage.getByRole('button', { name: new RegExp(`^${prefix} sentinel`) })).toBeVisible();
  await expect(workerPage.getByRole('button', { name: new RegExp(`^${prefix} mark`) })).toHaveCount(0);
});
