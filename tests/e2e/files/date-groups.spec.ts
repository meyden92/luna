import { expect } from '@playwright/test';
import { test } from '../fixtures/test';
import { dateGroups, fileCards, fileCount, loadAll } from '../utils/files-screen';

// The expected headings come from the gallery dataset, which is built from the same
// anchor function the seeding used (`dateAnchors`), never from literals.

test('date headings appear in order with the expected files under each', async ({ galleryPage, gallery }) => {
  await galleryPage.goto('/dashboard');
  await expect(fileCards(galleryPage).first()).toBeVisible();
  await loadAll(galleryPage, gallery.files.length);

  const shown = await dateGroups(galleryPage);

  expect(shown.map((g) => g.label)).toEqual(gallery.groups.map((g) => g.label));
  expect(shown.map((g) => g.titles)).toEqual(gallery.groups.map((g) => g.files.map((f) => f.title)));
  // Today and Yesterday always exist; the rest depend on the weekday and month.
  expect(shown[0]?.label).toBe('Today');
  expect(shown[1]?.label).toBe('Yesterday');
});

test('each heading states how many files it holds', async ({ galleryPage, gallery }) => {
  await galleryPage.goto('/dashboard');
  await expect(fileCards(galleryPage).first()).toBeVisible();
  await loadAll(galleryPage, gallery.files.length);

  for (const group of gallery.groups) {
    const section = galleryPage.locator('section', { has: galleryPage.getByRole('heading', { level: 2, name: group.label, exact: true }) });
    await expect(section.getByText(new RegExp(` · ${fileCount(group.files.length)}$`))).toBeVisible();
  }
});

test('the server-rendered page already has the right headings', async ({ galleryRequest, gallery }) => {
  // The first page (30 newest files) is rendered on the server. A server that
  // disagrees with the browser about the date would label it differently.
  const html = await (await galleryRequest.get('/dashboard')).text();
  const firstPage = gallery.groups.flatMap((g) => g.files).slice(0, 30);
  const labels = [...new Set(firstPage.map((f) => f.group))];

  const rendered = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);

  expect(rendered).toEqual(labels);
});

test('the browser shows the same headings once the page has loaded', async ({ galleryPage, gallery }) => {
  const hydrationErrors: string[] = [];
  galleryPage.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) hydrationErrors.push(message.text());
  });

  await galleryPage.goto('/dashboard');
  await expect(fileCards(galleryPage).first()).toBeVisible();

  const firstPage = gallery.groups.flatMap((g) => g.files).slice(0, 30);
  expect((await dateGroups(galleryPage)).map((g) => g.label)).toEqual([...new Set(firstPage.map((f) => f.group))]);
  expect(hydrationErrors).toEqual([]);
});
