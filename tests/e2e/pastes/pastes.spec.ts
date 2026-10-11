import { randomBytes } from 'node:crypto';
import { expect } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { snippet } from '../../../src/db/schema/files';
import { test } from '../fixtures/test';
import { createPaste, snippetId } from '../utils/pastes';

const unique = (label: string) => `${label}-${randomBytes(3).toString('hex')}`;

const CODE = 'const answer = 42;\nconsole.log(answer);';

test('a User creates a public and a private paste and both show up in the list with their age', async ({ workerPage, db }) => {
  const publicTitle = unique('Public paste');
  const privateTitle = unique('Private paste');

  await createPaste(workerPage, { title: publicTitle, code: CODE, language: 'JavaScript', isPublic: true });
  await createPaste(workerPage, { title: privateTitle, code: 'echo "only me"; ls -la', language: 'Bash' });

  const publicRow = workerPage.getByRole('button', { name: new RegExp(publicTitle) });
  const privateRow = workerPage.getByRole('button', { name: new RegExp(privateTitle) });
  await expect(publicRow).toContainText('javascript');
  await expect(publicRow).toContainText('less than a minute ago');
  await expect(privateRow).toContainText('bash');
  await expect(privateRow).toContainText('less than a minute ago');

  // The saved state is what the server holds, not just what the editor shows.
  const rows = await db
    .select()
    .from(snippet)
    .where(eq(snippet.id, await snippetId(db, publicTitle)));
  expect(rows[0]).toMatchObject({ isPublic: true, language: 'javascript', content: CODE });
  const privateRows = await db
    .select()
    .from(snippet)
    .where(eq(snippet.id, await snippetId(db, privateTitle)));
  expect(privateRows[0]).toMatchObject({ isPublic: false, language: 'bash' });

  await workerPage.getByRole('textbox', { name: 'Search snippets' }).fill(publicTitle);
  await expect(publicRow).toBeVisible();
  await expect(privateRow).toHaveCount(0);
});

test('an edit to a paste shows at its public link', async ({ workerPage, browser, db }) => {
  const title = unique('Edited paste');
  await createPaste(workerPage, { title, code: CODE, language: 'JavaScript', isPublic: true });
  const id = await snippetId(db, title);

  const reader = await browser.newContext();
  const readerPage = await reader.newPage();
  await readerPage.goto(`/bin/${id}`);
  await expect(readerPage.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(readerPage.getByText('answer = 42')).toBeVisible();

  const edited = `${title} v2`;
  await workerPage.getByRole('textbox', { name: 'Title' }).fill(edited);
  await workerPage.getByRole('textbox', { name: 'Code' }).fill('const answer = 43;\nconsole.log(answer);');
  await expect(workerPage.getByText('Saved', { exact: true })).toBeVisible();

  await readerPage.reload();
  await expect(readerPage.getByRole('heading', { level: 1, name: edited })).toBeVisible();
  await expect(readerPage.getByText('answer = 43')).toBeVisible();
  await expect(readerPage.getByText('answer = 42')).toHaveCount(0);
  await reader.close();
});

test('an anonymous visitor sees the public paste highlighted and the private one without its content', async ({
  workerPage,
  browser,
  db,
}) => {
  const publicTitle = unique('Shown paste');
  const privateTitle = unique('Hidden paste');
  const secret = `hunter2-${randomBytes(4).toString('hex')}`;
  await createPaste(workerPage, { title: publicTitle, code: CODE, language: 'JavaScript', isPublic: true });
  await createPaste(workerPage, { title: privateTitle, code: `const token = "${secret}";`, language: 'JavaScript' });
  const publicId = await snippetId(db, publicTitle);
  const privateId = await snippetId(db, privateTitle);

  const visitor = await browser.newContext();
  const page = await visitor.newPage();

  await page.goto(`/bin/${publicId}`);
  await expect(page.getByRole('heading', { level: 1, name: publicTitle })).toBeVisible();
  await expect(page.getByText('Public', { exact: true })).toBeVisible();
  // Highlighting: the keyword is painted in a different colour than the code around it.
  const keyword = page.locator('pre').getByText('const', { exact: true }).first();
  const colours = await keyword.evaluate((el) => ({
    keyword: getComputedStyle(el).color,
    block: getComputedStyle(el.closest('pre')!).color,
  }));
  expect(colours.keyword).not.toBe(colours.block);

  const response = await page.goto(`/bin/${privateId}`);
  await expect(page.getByText('This snippet is private')).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: privateTitle })).toHaveCount(0);
  const html = await response!.text();
  expect(html).not.toContain(secret);
  expect(html).not.toContain(privateTitle);
  await visitor.close();
});

test('a deleted paste no longer serves at its link', async ({ workerPage, browser, db }) => {
  const title = unique('Doomed paste');
  await createPaste(workerPage, { title, code: CODE, language: 'JavaScript', isPublic: true });
  const id = await snippetId(db, title);

  await workerPage.getByRole('button', { name: 'More' }).click();
  await workerPage.getByRole('menuitem', { name: 'Delete' }).click();
  await workerPage.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(workerPage.getByText('Snippet deleted')).toBeVisible();
  await expect(workerPage.getByRole('button', { name: new RegExp(title) })).toHaveCount(0);

  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  const response = await page.goto(`/bin/${id}`);
  await expect(page.getByText('Snippet not found')).toBeVisible();
  expect(await response!.text()).not.toContain('answer = 42');
  await visitor.close();
});
