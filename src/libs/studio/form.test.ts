import { describe, expect, test } from 'bun:test';
import { buildStudioForm, formRequestValues, initialFormValues, studioFormData, visibleFormItems } from './form';
import type { FieldConfig, JsonSchema, VariableConfig } from './types';

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

describe('buildStudioForm with Variables', () => {
  const variables: VariableConfig[] = [
    { name: 'extra', kind: 'text', required: false, order: 2, text: { multiline: true, placeholder: 'e.g. a hat', maxLength: 80 } },
    {
      name: 'style',
      kind: 'choice',
      label: 'Stil',
      required: true,
      default: 'comic book style',
      order: 0,
      options: [
        { label: 'Anime', value: 'anime style' },
        { label: '', value: 'comic book style' },
      ],
    },
    {
      name: 'photo',
      kind: 'file',
      label: 'Photo of the person',
      required: true,
      order: 1,
      file: { field: 'image_urls', position: 0, accept: ['image'] },
    },
    { name: 'age', kind: 'number', required: false, order: 3, group: 'Details', number: { min: 1, max: 99, step: 1, display: 'slider' } },
    {
      name: 'hd',
      kind: 'switch',
      required: false,
      order: 4,
      default: true,
      switch: { on: 'in 4k', off: '' },
      visibleIf: { field: 'style', in: ['anime style'] },
    },
  ];
  const released: FieldConfig[] = [
    { name: 'prompt', mode: 'fixed', order: 0, value: '{style} {extra}' },
    { name: 'num_images', mode: 'shown', order: 1 },
  ];

  test("renders the Variables in their order before the released Fields, with each choice's label for its value", () => {
    const form = buildStudioForm({ fields: released, schema: input, variables });
    expect(form.items.map((item) => [item.name, item.control])).toEqual([
      ['style', 'chips'],
      ['photo', 'file'],
      ['extra', 'textarea'],
      ['age', 'slider'],
      ['hd', 'switch'],
      ['num_images', 'number'],
    ]);
    expect(form.items[0]).toMatchObject({
      label: 'Stil',
      required: true,
      defaultValue: 'comic book style',
      options: [
        { value: 'anime style', label: 'Anime' },
        { value: 'comic book style', label: 'comic book style' },
      ],
    });
    expect(form.items[1]).toMatchObject({ label: 'Photo of the person', multiple: false, maxItems: 1, accept: ['image'] });
    expect(form.items[2]).toMatchObject({ label: 'Extra', placeholder: 'e.g. a hat', maxLength: 80 });
    expect(form.items[3]).toMatchObject({ min: 1, max: 99, step: 1, group: 'Details' });
  });

  test('a Variable shown only for one choice appears once that choice is picked', () => {
    const form = buildStudioForm({ fields: released, schema: input, variables });
    const values = initialFormValues(form);
    expect(visibleFormItems(form, values).map((item) => item.name)).not.toContain('hd');
    expect(visibleFormItems(form, { ...values, style: 'anime style' }).map((item) => item.name)).toContain('hd');
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

describe('formRequestValues', () => {
  test('holds what the request would carry: fixed values, visible values, and defaults for empty ones', () => {
    const form = buildStudioForm({ fields, schema: input });
    const values = { prompt: 'a cat', aspect_ratio: '1:1', num_images: '', style: 'b' };
    // `style` is hidden while the ratio is 1:1, so its value is not sent.
    expect(formRequestValues(form, values)).toEqual({ safety: false, prompt: 'a cat', aspect_ratio: '1:1', num_images: 1 });
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
