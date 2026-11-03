import { describe, expect, test } from 'bun:test';
import { buildRequestInput, RequestValidationError } from './request';
import type { FieldConfig, FileRef, JsonSchema } from './types';

const schema: JsonSchema = {
  type: 'object',
  required: ['prompt'],
  properties: {
    prompt: { type: 'string', maxLength: 50 },
    aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16'], default: '1:1' },
    num_images: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
    guidance_scale: { type: 'number', minimum: 0, maximum: 20 },
    enable_safety_checker: { type: 'boolean', default: true },
    seed: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    image_urls: { type: 'array', items: { type: 'string', format: 'uri' }, maxItems: 2 },
    image_url: { type: 'string', format: 'uri' },
    style: { type: 'string', enum: ['photo', 'anime'] },
    style_strength: { type: 'number', minimum: 0, maximum: 1 },
  },
};

const field = (name: string, mode: FieldConfig['mode'], extra: Partial<FieldConfig> = {}): FieldConfig => ({
  name,
  mode,
  order: 0,
  ...extra,
});

function issuesOf(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof RequestValidationError) return error.issues.map((issue) => issue.field);
    throw error;
  }
  throw new Error('expected a RequestValidationError');
}

describe('buildRequestInput: modes', () => {
  test('sends shown values, fixed values and nothing for fal defaults', () => {
    const fields = [
      field('prompt', 'shown'),
      field('aspect_ratio', 'shown', { value: '16:9' }),
      field('enable_safety_checker', 'fixed', { value: false }),
      field('num_images', 'default'),
    ];
    expect(buildRequestInput({ fields, schema, values: { prompt: 'a cat', num_images: 3 } })).toEqual({
      prompt: 'a cat',
      aspect_ratio: '16:9',
      enable_safety_checker: false,
    });
  });

  test('a fixed value wins over what the User sent', () => {
    const fields = [field('prompt', 'shown'), field('enable_safety_checker', 'fixed', { value: true })];
    expect(buildRequestInput({ fields, schema, values: { prompt: 'x', enable_safety_checker: false } })).toEqual({
      prompt: 'x',
      enable_safety_checker: true,
    });
  });

  test('an empty optional shown Field is omitted, so fal applies its default', () => {
    const fields = [field('prompt', 'shown'), field('guidance_scale', 'shown'), field('seed', 'shown')];
    expect(buildRequestInput({ fields, schema, values: { prompt: 'x', guidance_scale: null, seed: '' } })).toEqual({ prompt: 'x' });
  });
});

describe('buildRequestInput: validation', () => {
  test('a required Field left empty is refused', () => {
    expect(issuesOf(() => buildRequestInput({ fields: [field('prompt', 'shown')], schema, values: { prompt: '' } }))).toEqual(['prompt']);
  });

  test('a required property not configured as shown or fixed is refused', () => {
    expect(issuesOf(() => buildRequestInput({ fields: [field('prompt', 'default')], schema, values: {} }))).toEqual(['prompt']);
  });

  test('types, schema ranges and lengths are enforced', () => {
    const fields = [
      field('prompt', 'shown'),
      field('num_images', 'shown'),
      field('enable_safety_checker', 'shown'),
      field('seed', 'shown'),
    ];
    expect(
      issuesOf(() =>
        buildRequestInput({
          fields,
          schema,
          values: { prompt: 'x'.repeat(51), num_images: 2.5, enable_safety_checker: 'yes', seed: 'abc' },
        }),
      ),
    ).toEqual(['prompt', 'num_images', 'enable_safety_checker', 'seed']);
    expect(issuesOf(() => buildRequestInput({ fields, schema, values: { prompt: 'x', num_images: 5 } }))).toEqual(['num_images']);
  });

  test('a nullable property accepts a value of its non-null branch', () => {
    const fields = [field('prompt', 'shown'), field('seed', 'shown')];
    expect(buildRequestInput({ fields, schema, values: { prompt: 'x', seed: 7 } })).toEqual({ prompt: 'x', seed: 7 });
  });

  test('a range narrowed by the config is enforced inside the schema range', () => {
    const fields = [field('prompt', 'shown'), field('num_images', 'shown', { min: 1, max: 2 })];
    expect(buildRequestInput({ fields, schema, values: { prompt: 'x', num_images: 2 } })).toMatchObject({ num_images: 2 });
    expect(issuesOf(() => buildRequestInput({ fields, schema, values: { prompt: 'x', num_images: 3 } }))).toEqual(['num_images']);
  });

  test('options narrowed by the config refuse a schema enum value the admin hid', () => {
    const options = [
      { value: '1:1', label: 'Square' },
      { value: '16:9', label: 'Wide' },
    ];
    const fields = [field('prompt', 'shown'), field('aspect_ratio', 'shown', { options })];
    expect(buildRequestInput({ fields, schema, values: { prompt: 'x', aspect_ratio: '16:9' } })).toMatchObject({ aspect_ratio: '16:9' });
    expect(issuesOf(() => buildRequestInput({ fields, schema, values: { prompt: 'x', aspect_ratio: '9:16' } }))).toEqual(['aspect_ratio']);
    expect(issuesOf(() => buildRequestInput({ fields, schema, values: { prompt: 'x', aspect_ratio: '4:3' } }))).toEqual(['aspect_ratio']);
  });

  test('every problem is reported at once, labelled for the User', () => {
    const fields = [field('prompt', 'shown', { label: 'Beschreibung' }), field('num_images', 'shown', { label: 'Anzahl' })];
    try {
      buildRequestInput({ fields, schema, values: { prompt: '', num_images: 9 } });
      throw new Error('expected a RequestValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationError);
      expect((error as Error).message).toContain('Beschreibung');
      expect((error as Error).message).toContain('Anzahl');
    }
  });
});

describe('buildRequestInput: file inputs', () => {
  test('passes file references through for the pipeline to upload, single or as an array', () => {
    const fields = [field('prompt', 'shown'), field('image_urls', 'shown', { display: 'file', accept: ['image'] })];
    const refs: FileRef[] = [
      { source: 'upload', key: 'upload:0' },
      { source: 'output', outputId: 'out-1' },
    ];
    expect(buildRequestInput({ fields, schema, values: { prompt: 'x', image_urls: refs } })).toEqual({ prompt: 'x', image_urls: refs });

    const single = [field('prompt', 'shown'), field('image_url', 'shown', { display: 'file', accept: ['image'] })];
    expect(buildRequestInput({ fields: single, schema, values: { prompt: 'x', image_url: { source: 'file', fileId: 'f-1' } } })).toEqual({
      prompt: 'x',
      image_url: { source: 'file', fileId: 'f-1' },
    });
  });

  test('refuses something that is not a file reference, and more files than the schema allows', () => {
    const fields = [field('prompt', 'shown'), field('image_urls', 'shown', { display: 'file', accept: ['image'] })];
    expect(
      issuesOf(() => buildRequestInput({ fields, schema, values: { prompt: 'x', image_urls: ['https://evil.example/a.png'] } })),
    ).toEqual(['image_urls']);
    const three = [1, 2, 3].map((n) => ({ source: 'file', fileId: `f-${n}` }));
    expect(issuesOf(() => buildRequestInput({ fields, schema, values: { prompt: 'x', image_urls: three } }))).toEqual(['image_urls']);
  });
});

describe('buildRequestInput: visibleIf', () => {
  const fields = [
    field('prompt', 'shown'),
    field('style', 'shown'),
    field('style_strength', 'shown', { visibleIf: { field: 'style', in: ['anime'] } }),
  ];

  test('a Field whose condition holds is validated and sent', () => {
    expect(buildRequestInput({ fields, schema, values: { prompt: 'x', style: 'anime', style_strength: 0.5 } })).toEqual({
      prompt: 'x',
      style: 'anime',
      style_strength: 0.5,
    });
    expect(issuesOf(() => buildRequestInput({ fields, schema, values: { prompt: 'x', style: 'anime', style_strength: 3 } }))).toEqual([
      'style_strength',
    ]);
  });

  test('a hidden Field is neither validated nor sent', () => {
    expect(buildRequestInput({ fields, schema, values: { prompt: 'x', style: 'photo', style_strength: 3 } })).toEqual({
      prompt: 'x',
      style: 'photo',
    });
  });

  test('a condition reads the default of the Field it depends on', () => {
    const withDefault = [field('prompt', 'shown'), field('style', 'shown', { value: 'anime' }), fields[2] as FieldConfig];
    expect(buildRequestInput({ fields: withDefault, schema, values: { prompt: 'x', style_strength: 0.2 } })).toMatchObject({
      style_strength: 0.2,
    });
  });

  test('a Field depending on a hidden Field is hidden too', () => {
    const chained = [
      field('prompt', 'shown'),
      field('style', 'shown', { visibleIf: { field: 'enable_safety_checker', in: [false] } }),
      field('enable_safety_checker', 'shown'),
      field('style_strength', 'shown', { visibleIf: { field: 'style', in: ['anime'] } }),
    ];
    expect(
      buildRequestInput({
        fields: chained,
        schema,
        values: { prompt: 'x', enable_safety_checker: true, style: 'anime', style_strength: 0.5 },
      }),
    ).toEqual({ prompt: 'x', enable_safety_checker: true });
  });

  test('a required Field that is hidden is not demanded', () => {
    const hiddenPrompt = [field('prompt', 'shown', { visibleIf: { field: 'style', in: ['anime'] } }), field('style', 'shown')];
    expect(buildRequestInput({ fields: hiddenPrompt, schema, values: { style: 'photo' } })).toEqual({ style: 'photo' });
  });
});
