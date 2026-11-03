import { describe, expect, test } from 'bun:test';
import { buildStudioForm, initialFormValues, studioFormData, visibleFormItems } from './form';
import type { FieldConfig, JsonSchema } from './types';

const input: JsonSchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string', title: 'Prompt', description: 'What to generate.' },
    aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16'], default: '1:1', title: 'Aspect Ratio' },
    num_images: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
    style: { type: 'string', enum: ['a', 'b', 'c', 'd', 'e', 'f'] },
    image_urls: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    safety: { type: 'boolean', default: true },
  },
  required: ['prompt'],
};

const fields: FieldConfig[] = [
  { name: 'num_images', mode: 'shown', order: 2, display: 'slider', max: 2, group: 'Advanced' },
  { name: 'prompt', mode: 'shown', order: 0 },
  {
    name: 'aspect_ratio',
    mode: 'shown',
    order: 1,
    label: 'Seitenverhältnis',
    options: [
      { value: '1:1', label: 'Quadrat' },
      { value: '16:9', label: 'Breit' },
    ],
  },
  { name: 'style', mode: 'shown', order: 3, visibleIf: { field: 'aspect_ratio', in: ['16:9'] } },
  { name: 'image_urls', mode: 'shown', order: 4, display: 'file', accept: ['image'] },
  { name: 'safety', mode: 'fixed', order: 5, value: false },
];

describe('buildStudioForm', () => {
  test('renders the shown Fields in order, with labels, narrowed choices and ranges', () => {
    const { items } = buildStudioForm({ fields, schema: input });

    expect(items.map((item) => [item.name, item.control])).toEqual([
      ['prompt', 'textarea'],
      ['aspect_ratio', 'chips'],
      ['num_images', 'slider'],
      ['style', 'select'],
      ['image_urls', 'file'],
    ]);
    expect(items[0]).toMatchObject({ label: 'Prompt', help: 'What to generate.', required: true });
    expect(items[1]).toMatchObject({
      label: 'Seitenverhältnis',
      options: [
        { value: '1:1', label: 'Quadrat' },
        { value: '16:9', label: 'Breit' },
      ],
      defaultValue: '1:1',
    });
    expect(items[2]).toMatchObject({ label: 'Num images', min: 1, max: 2, step: 1, group: 'Advanced' });
    expect(items[4]).toMatchObject({ multiple: true, maxItems: 3, accept: ['image'] });
  });

  test('keeps the values of Fields Users do not see, for conditional visibility', () => {
    expect(buildStudioForm({ fields, schema: input }).context).toEqual({ safety: false });
  });
});

describe('visibleFormItems', () => {
  test('hides a Field until the one it depends on has a listed value', () => {
    const form = buildStudioForm({ fields, schema: input });
    const values = initialFormValues(form);

    expect(visibleFormItems(form, values).map((item) => item.name)).not.toContain('style');
    expect(visibleFormItems(form, { ...values, aspect_ratio: '16:9' }).map((item) => item.name)).toContain('style');
  });

  test('reads a dependency on a Field Users do not see from its fixed value', () => {
    const form = buildStudioForm({
      fields: fields.map((field) => (field.name === 'style' ? { ...field, visibleIf: { field: 'safety', in: [false] } } : field)),
      schema: input,
    });
    expect(visibleFormItems(form, initialFormValues(form)).map((item) => item.name)).toContain('style');
  });
});

describe('initialFormValues', () => {
  test('starts from the configured default, else the schema default', () => {
    const form = buildStudioForm({
      fields: fields.map((field) => (field.name === 'num_images' ? { ...field, value: 2 } : field)),
      schema: input,
    });
    expect(initialFormValues(form)).toEqual({ aspect_ratio: '1:1', num_images: 2, image_urls: [] });
  });
});

describe('studioFormData', () => {
  test('sends files as upload parts named by the refs in the payload values', async () => {
    const photo = new File(['png'], 'photo.png', { type: 'image/png' });
    const data = studioFormData({ modelId: 'm1' }, { prompt: 'a cat', image_urls: [photo, { source: 'file', fileId: 'f1' }] });

    const payload = JSON.parse(String(data.get('payload')));
    expect(payload).toEqual({
      modelId: 'm1',
      values: {
        prompt: 'a cat',
        image_urls: [
          { source: 'upload', key: 'image_urls.0' },
          { source: 'file', fileId: 'f1' },
        ],
      },
    });
    expect(await (data.get('image_urls.0') as File).text()).toBe('png');
  });
});
