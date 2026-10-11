import { expect } from '@playwright/test';
import { CORPUS } from '../fixtures/corpus';
import { test } from '../fixtures/test';
import { galleryFileIds, previewOf } from '../utils/preview';

// What the Preview shows for each kind of file, using the gallery user's first copy of every corpus file.
// Only images go on the stage; every other kind gets its extension and the panel's Copy link as the primary action.

const MAX_TYPE_LABEL = 5;

for (const entry of CORPUS) {
  test(`${entry.name} is previewed as ${entry.mimeType.startsWith('image/') ? 'an image' : 'a file card'}`, async ({ galleryPage, db }) => {
    const id = (await galleryFileIds(db)).get(entry.name)!;
    await galleryPage.goto(`/dashboard?file=${id}`);
    const preview = previewOf(galleryPage, entry.name);
    await expect(preview).toBeVisible();
    const panel = preview.getByRole('complementary');
    await expect(panel.getByRole('heading', { level: 2, name: entry.name })).toBeVisible();

    if (entry.mimeType.startsWith('image/')) {
      // The browser decoded the stored object at its real size.
      // The filmstrip repeats the thumbnail with the same name; the stage image comes first.
      const image = preview.getByRole('img', { name: entry.name, exact: true }).first();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      if (entry.dimensions) {
        await expect(image).toHaveJSProperty('naturalWidth', entry.dimensions.width);
        await expect(image).toHaveJSProperty('naturalHeight', entry.dimensions.height);
        await expect(panel.getByText(`${entry.dimensions.width} × ${entry.dimensions.height}`, { exact: true })).toBeVisible();
      }
      await expect(preview.getByText('Failed to load image')).toBeHidden();
      await expect(panel.getByRole('button', { name: /^Copy image/ })).toBeVisible();
      await expect(panel.getByRole('button', { name: /^Copy link/ })).toContainText('⇧⌘C');
    } else {
      // Nothing to draw: the stage names the file type, and Copy link is the only copy action.
      const type = (await panel.locator('dt:text-is("Type") + dd').textContent())!;
      // The label is the extension in capitals; a name without one falls back to the MIME subtype.
      if (entry.name.includes('.')) expect(type).toBe(entry.name.split('.').pop()!.toUpperCase().slice(0, MAX_TYPE_LABEL));
      await expect(preview.getByText(`.${type.toLowerCase()}`, { exact: true })).toBeVisible();
      await expect(panel.getByRole('button', { name: /^Copy link/ })).toContainText('⌘C');
      await expect(panel.getByRole('button', { name: /^Copy image/ })).toHaveCount(0);
      await expect(preview.locator('video, audio, iframe, object')).toHaveCount(0);
    }

    await expect(panel.getByRole('link', { name: 'Open direct link' })).toHaveAttribute('target', '_blank');
    await expect(panel.getByRole('link', { name: 'Download' })).toHaveAttribute('download', entry.name);
  });
}
