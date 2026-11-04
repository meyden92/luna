import { describe, expect, test } from 'bun:test';
import { defaultFieldConfigs, isOfferedCategory, propertyShape, suggestPricing, validateModelConfig } from './model-config';
import type { FieldConfig, JsonSchema } from './types';

const imageInput: JsonSchema = {
  type: 'object',
  properties: {
    seed: { type: 'integer', title: 'Seed' },
    prompt: { type: 'string', title: 'Prompt' },
    aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16'], default: '1:1' },
    num_images: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
    guidance_scale: { type: 'number', minimum: 0, maximum: 20, default: 3.5 },
    image_urls: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
    mask: { type: 'string', format: 'uri' },
    video_url: { type: 'string' },
  },
  'x-fal-order-properties': ['prompt', 'image_urls', 'aspect_ratio', 'num_images', 'guidance_scale', 'seed', 'mask', 'video_url'],
  required: ['prompt', 'image_urls'],
};

describe('propertyShape', () => {
  test('detects file inputs from *_url / *_urls names and URI strings', () => {
    expect(propertyShape('video_url', { type: 'string' }).kind).toBe('file');
    expect(propertyShape('image_urls', { type: 'array', items: { type: 'string' } }).kind).toBe('files');
    expect(propertyShape('mask', { type: 'string', format: 'uri' }).kind).toBe('file');
    expect(propertyShape('webhook', { type: 'string' }).kind).toBe('string');
  });

  test('reads the enum of an anyOf branch, as fal writes image_size', () => {
    const shape = propertyShape('image_size', {
      anyOf: [
        { type: 'object', properties: {} },
        { type: 'string', enum: ['square_hd', 'portrait_4_3'] },
      ],
    });
    expect(shape).toMatchObject({ kind: 'enum', enum: ['square_hd', 'portrait_4_3'] });
  });
});

describe('defaultFieldConfigs', () => {
  test('shows prompt, file inputs, aspect ratio, the output count and required inputs, leaves the rest to fal, in fal order', () => {
    const fields = defaultFieldConfigs(imageInput);

    expect(fields.map((field) => [field.name, field.mode])).toEqual([
      ['prompt', 'shown'],
      ['image_urls', 'shown'],
      ['aspect_ratio', 'shown'],
      ['num_images', 'shown'],
      ['guidance_scale', 'default'],
      ['seed', 'default'],
      ['mask', 'shown'],
      ['video_url', 'shown'],
    ]);
    expect(fields.map((field) => field.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test('marks file inputs as such, with the media kind suggested by the name', () => {
    const byName = new Map(defaultFieldConfigs(imageInput).map((field) => [field.name, field]));

    expect(byName.get('image_urls')).toMatchObject({ display: 'file', accept: ['image'] });
    expect(byName.get('video_url')).toMatchObject({ display: 'file', accept: ['video'] });
    expect(byName.get('mask')).toMatchObject({ display: 'file', accept: ['image'] });
    expect(byName.get('prompt')?.accept).toBeUndefined();
  });

  test('puts properties fal does not order after the ordered ones', () => {
    const fields = defaultFieldConfigs({
      type: 'object',
      properties: { extra: { type: 'string' }, prompt: { type: 'string' } },
      'x-fal-order-properties': ['prompt'],
    });
    expect(fields.map((field) => field.name)).toEqual(['prompt', 'extra']);
  });
});

describe('suggestPricing', () => {
  test('counts images per image, seconds per second, and one unit otherwise', () => {
    const video: JsonSchema = { type: 'object', properties: { duration: { type: 'string', enum: ['5', '10'] } } };

    expect(suggestPricing({ unit: 'image', unitPrice: 0.03, currency: 'USD' }, imageInput).quantity).toEqual({
      kind: 'field',
      field: 'num_images',
    });
    expect(suggestPricing({ unit: 'second', unitPrice: 0.1, currency: 'USD' }, video).quantity).toEqual({
      kind: 'field',
      field: 'duration',
    });
    expect(suggestPricing({ unit: 'megapixel', unitPrice: 0.025, currency: 'USD' }, imageInput).quantity).toEqual({
      kind: 'fixed',
      value: 1,
    });
    expect(suggestPricing({ unit: 'second', unitPrice: 0.1, currency: 'USD' }, imageInput).quantity).toEqual({ kind: 'fixed', value: 1 });
  });
});

describe('isOfferedCategory', () => {
  test('hides categories whose models answer with text', () => {
    for (const category of ['llm', 'vision', 'speech-to-text', 'image-to-text', 'video-to-text'])
      expect(isOfferedCategory(category)).toBe(false);
    for (const category of ['text-to-image', 'image-to-video', 'text-to-speech', 'image-to-3d'])
      expect(isOfferedCategory(category)).toBe(true);
  });
});

describe('validateModelConfig', () => {
  const valid = () => defaultFieldConfigs(imageInput);
  const withField = (name: string, change: Partial<FieldConfig>) =>
    valid().map((field) => (field.name === name ? { ...field, ...change } : field));
  const messages = (fields: FieldConfig[]) => validateModelConfig(fields, imageInput).map((issue) => `${issue.field}: ${issue.message}`);

  test('accepts the default configuration', () => {
    expect(messages(valid())).toEqual([]);
  });

  test('refuses a fixed value the schema does not allow', () => {
    expect(messages(withField('num_images', { mode: 'fixed', value: 9 }))).toEqual(['num_images: The value must be at most 4.']);
    expect(messages(withField('aspect_ratio', { mode: 'fixed', value: '2:1' }))).toEqual([
      'aspect_ratio: The value is not one of the offered choices.',
    ]);
    expect(messages(withField('guidance_scale', { mode: 'fixed' }))).toEqual(['guidance_scale: A fixed Field needs a value.']);
  });

  test('refuses a range wider than the schema allows, or upside down', () => {
    expect(messages(withField('num_images', { min: 0 }))).toEqual(['num_images: The minimum cannot be below the schema minimum of 1.']);
    expect(messages(withField('num_images', { max: 8 }))).toEqual(['num_images: The maximum cannot be above the schema maximum of 4.']);
    expect(messages(withField('num_images', { min: 3, max: 2 }))).toEqual(['num_images: The minimum is above the maximum.']);
  });

  test('refuses options that are not in the schema enum, and a default outside the narrowed options', () => {
    expect(messages(withField('aspect_ratio', { options: [{ value: '2:1', label: 'Wide' }] }))).toEqual([
      'aspect_ratio: 2:1 is not a choice of this input.',
    ]);
    expect(messages(withField('aspect_ratio', { options: [{ value: '16:9', label: 'Wide' }], value: '1:1' }))).toEqual([
      'aspect_ratio: The value is not one of the offered choices.',
    ]);
  });

  test('requires visibleIf to name another Field and values it can take', () => {
    expect(messages(withField('num_images', { visibleIf: { field: 'nope', in: ['x'] } }))).toEqual([
      'num_images: Shown only when references nope, which is not a Field.',
    ]);
    expect(messages(withField('num_images', { visibleIf: { field: 'aspect_ratio', in: ['2:1'] } }))).toEqual([
      'num_images: Shown only when lists 2:1, which aspect_ratio cannot be.',
    ]);
    expect(messages(withField('num_images', { visibleIf: { field: 'num_images', in: [1] } }))).toEqual([
      'num_images: A Field cannot depend on itself.',
    ]);
    expect(messages(withField('num_images', { visibleIf: { field: 'aspect_ratio', in: ['16:9'] } }))).toEqual([]);
  });

  test('requires every required input to be shown or fixed', () => {
    expect(messages(withField('prompt', { mode: 'default' }))).toEqual([
      'prompt: The model requires this input, so it must be shown or fixed.',
    ]);
  });

  test('refuses a fixed file input and a file input that accepts nothing', () => {
    expect(messages(withField('video_url', { mode: 'fixed' }))).toEqual(['video_url: A file input cannot be fixed.']);
    expect(messages(withField('video_url', { accept: [] }))).toEqual(['video_url: A file input must accept at least one media kind.']);
  });

  test('refuses a display the input type cannot use', () => {
    expect(messages(withField('prompt', { display: 'slider' }))).toEqual(['prompt: Text cannot be displayed as slider.']);
    expect(messages(withField('seed', { mode: 'shown', display: 'slider' }))).toEqual(['seed: A slider needs a minimum and a maximum.']);
  });
});
