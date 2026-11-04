import { describe, expect, test } from 'bun:test';
import type { StudioCatalogCategory, StudioEntry } from './catalog';
import { buildStudioForm } from './form';
import { attachOutput, continueTargets, reseedValues, reusableValues, uploadsExpireAt } from './history-actions';
import type { FieldConfig, FileRef, JsonSchema } from './types';

const prompt: JsonSchema = { type: 'string' };

function entry(id: string, categoryId: string, properties: Record<string, JsonSchema>, fields: FieldConfig[]): StudioEntry {
  return {
    kind: 'model',
    id,
    name: id,
    description: null,
    categoryId,
    fields,
    variables: [],
    schema: { type: 'object', properties },
    pricing: null,
    previewUrls: [],
  };
}

const textToImage = entry('t2i', 'create', { prompt }, [{ name: 'prompt', mode: 'shown', order: 0 }]);
const imageToVideo = entry('i2v', 'animate', { prompt, image_url: { type: 'string' } }, [
  { name: 'prompt', mode: 'shown', order: 0 },
  { name: 'image_url', mode: 'shown', order: 1, display: 'file', accept: ['image'] },
]);
const editImages = entry('edit', 'edit', { prompt, image_urls: { type: 'array', items: { type: 'string' }, maxItems: 2 } }, [
  { name: 'prompt', mode: 'shown', order: 0 },
  { name: 'image_urls', mode: 'shown', order: 1, display: 'file', accept: ['image'] },
]);
const videoToVideo = entry('v2v', 'restyle', { video_url: { type: 'string' } }, [
  { name: 'video_url', mode: 'shown', order: 0, display: 'file', accept: ['video'] },
]);
const hiddenImage = entry('fixed', 'fixed', { image_url: { type: 'string' } }, [{ name: 'image_url', mode: 'default', order: 0 }]);

const categories: StudioCatalogCategory[] = [
  { id: 'create', name: 'Create image', icon: 'Image', entries: [textToImage] },
  { id: 'animate', name: 'Animate', icon: 'Video', entries: [textToImage, imageToVideo] },
  { id: 'edit', name: 'Edit image', icon: 'Pencil', entries: [editImages] },
  { id: 'restyle', name: 'Restyle video', icon: 'Video', entries: [videoToVideo] },
  { id: 'fixed', name: 'Fixed', icon: 'Box', entries: [hiddenImage] },
];

describe('continueTargets', () => {
  test('offers each Category with an entry whose shown file input accepts the media kind, naming that entry and input', () => {
    expect(continueTargets(categories, 'image').map(({ category, entry, field }) => [category.id, entry.id, field])).toEqual([
      ['animate', 'i2v', 'image_url'],
      ['edit', 'edit', 'image_urls'],
    ]);
    expect(continueTargets(categories, 'video').map(({ category }) => category.id)).toEqual(['restyle']);
    expect(continueTargets(categories, 'audio')).toEqual([]);
  });

  test('a file input without accept takes any media kind', () => {
    const any = entry('any', 'any', { file_url: { type: 'string' } }, [{ name: 'file_url', mode: 'shown', order: 0, display: 'file' }]);
    expect(continueTargets([{ id: 'any', name: 'Any', icon: 'Box', entries: [any] }], 'model3d')).toHaveLength(1);
  });
});

describe('attachOutput', () => {
  const ref = { source: 'output', outputId: 'out-1' } as const;

  test('puts the Output into a single file input, replacing what was there', () => {
    const form = buildStudioForm(imageToVideo);
    expect(attachOutput(form, { prompt: 'a cat', image_url: { source: 'file', fileId: 'f' } }, 'image_url', ref)).toEqual({
      prompt: 'a cat',
      image_url: ref,
    });
  });

  test('appends the Output to a list input while it has room', () => {
    const form = buildStudioForm(editImages);
    expect(attachOutput(form, { image_urls: [] }, 'image_urls', ref)).toEqual({ image_urls: [ref] });
    const full = [
      { source: 'file', fileId: 'a' },
      { source: 'file', fileId: 'b' },
    ] as const;
    expect(attachOutput(form, { image_urls: [...full] }, 'image_urls', ref)).toEqual({ image_urls: [full[0], ref] });
  });
});

describe('reseedValues', () => {
  const random = () => 0.5;

  test('gives a shown seed Field a new random value within its range', () => {
    const fields: FieldConfig[] = [{ name: 'seed', mode: 'shown', order: 0 }];
    expect(reseedValues(fields, { prompt: 'a cat', seed: 7 }, random)).toEqual({ prompt: 'a cat', seed: 1073741824 });
    const narrowed: FieldConfig[] = [{ name: 'seed', mode: 'shown', order: 0, min: 10, max: 20 }];
    expect(reseedValues(narrowed, { seed: 10 }, random)).toEqual({ seed: 15 });
  });

  test('leaves the values alone when the seed is fixed, left to fal, or absent', () => {
    const values = { prompt: 'a cat', seed: 7 };
    expect(reseedValues([{ name: 'seed', mode: 'fixed', value: 1, order: 0 }], values, random)).toEqual(values);
    expect(reseedValues([{ name: 'seed', mode: 'default', order: 0 }], values, random)).toEqual(values);
    expect(reseedValues([{ name: 'prompt', mode: 'shown', order: 0 }], values, random)).toEqual(values);
  });
});

describe('reusableValues', () => {
  const kept = new Set(['live-output', 'live-file']);
  const usable = (ref: FileRef) => (ref.source === 'output' ? kept.has(ref.outputId) : ref.source === 'file' && kept.has(ref.fileId));

  test('keeps plain values and the files that still exist, and drops the rest', () => {
    const live = { source: 'output', outputId: 'live-output' } as const;
    const file = { source: 'file', fileId: 'live-file' } as const;
    expect(
      reusableValues(
        {
          prompt: 'a cat',
          num_images: 2,
          image_url: { source: 'output', outputId: 'expired-output' },
          image_urls: [
            live,
            { source: 'url', url: 'https://fal.media/x.png', expiresAt: '2026-11-05T00:00:00Z' },
            file,
            { source: 'file', fileId: 'deleted' },
          ],
          upload_url: { source: 'url', url: 'https://fal.media/y.png', expiresAt: '2026-11-05T00:00:00Z' },
        },
        usable,
      ),
    ).toEqual({ prompt: 'a cat', num_images: 2, image_urls: [live, file] });
  });
});

describe('uploadsExpireAt', () => {
  const upload = (expiresAt: string) => ({ source: 'url', url: 'https://fal.media/x.png', expiresAt });

  test('is when the first upload goes, alone or in a list', () => {
    expect(uploadsExpireAt({ prompt: 'a cat', image_url: upload('2026-11-05T11:59:59Z') })).toBe('2026-11-05T11:59:59Z');
    expect(
      uploadsExpireAt({
        image_urls: [upload('2026-11-06T00:00:00Z'), upload('2026-11-05T12:00:00Z')],
        mask: upload('2026-11-07T00:00:00Z'),
      }),
    ).toBe('2026-11-05T12:00:00Z');
  });

  test('is null without uploads', () => {
    expect(uploadsExpireAt({ prompt: 'a cat', image_url: { source: 'output', outputId: 'o-1' } })).toBeNull();
  });
});
