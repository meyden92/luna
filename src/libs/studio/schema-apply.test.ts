import { describe, expect, test } from 'bun:test';
import { planSchemaApply } from './schema-apply';
import type { FieldConfig, JsonSchema, StudioPricing, VariableConfig } from './types';

// fake/edit-like: a prompt, an image list and an aspect ratio choice.
const before: JsonSchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    image_urls: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
    aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16'], default: '1:1' },
    num_images: { type: 'integer', minimum: 1, maximum: 4 },
  },
  required: ['prompt'],
};

const schema = (properties: Record<string, JsonSchema | undefined>, required = before.required): JsonSchema => ({
  ...before,
  properties: Object.fromEntries(
    Object.entries({ ...before.properties, ...properties }).filter((entry): entry is [string, JsonSchema] => entry[1] !== undefined),
  ),
  required,
});

const pricing: StudioPricing = { unit: 'image', unitPrice: 0.03, currency: 'USD', quantity: { kind: 'field', field: 'num_images' } };

const modelFields: FieldConfig[] = [
  { name: 'prompt', mode: 'shown', order: 0 },
  { name: 'image_urls', mode: 'shown', order: 1, display: 'file', accept: ['image'] },
  {
    name: 'aspect_ratio',
    mode: 'shown',
    order: 2,
    value: '16:9',
    options: [
      { value: '1:1', label: 'Square' },
      { value: '16:9', label: 'Wide' },
    ],
  },
  { name: 'num_images', mode: 'shown', order: 3, min: 1, max: 4, visibleIf: { field: 'aspect_ratio', in: ['1:1', '16:9'] } },
];

const templateFields: FieldConfig[] = [
  { name: 'prompt', mode: 'fixed', order: 0, value: 'A {style} photo' },
  { name: 'image_urls', mode: 'default', order: 1, display: 'file', accept: ['image'] },
  { name: 'aspect_ratio', mode: 'fixed', order: 2, value: '16:9' },
  { name: 'num_images', mode: 'default', order: 3 },
];
const style: VariableConfig = { name: 'style', kind: 'text', required: false, order: 0 };
const photo: VariableConfig = {
  name: 'photo',
  kind: 'file',
  required: false,
  order: 1,
  file: { field: 'image_urls', position: 0, accept: ['image'] },
};
const template = { id: 't1', name: 'Wide photo', fields: templateFields, variables: [style, photo] };

const plan = (after: JsonSchema, templates = [template]) =>
  planSchemaApply({ before, after, model: { fields: modelFields, pricing }, templates });

const names = (fields: FieldConfig[]) => fields.map((field) => field.name);

describe('planSchemaApply', () => {
  test('drops removed Fields and conditions on them, adds new ones at fal default, and names what used the removed input', () => {
    const result = plan(schema({ aspect_ratio: undefined, guidance: { type: 'number' } }));

    expect(names(result.model.fields)).toEqual(['prompt', 'image_urls', 'num_images', 'guidance']);
    expect(result.model.fields.at(-1)).toEqual({ name: 'guidance', mode: 'default', order: 4 });
    expect(result.model.fields.find((field) => field.name === 'num_images')?.visibleIf).toBeUndefined();
    expect(result.model.affected).toEqual(['aspect_ratio']);
    expect(result.model.issues).toEqual([]);

    const [templatePlan] = result.templates;
    expect(names(templatePlan?.fields ?? [])).toEqual(['prompt', 'image_urls', 'num_images', 'guidance']);
    expect(templatePlan?.affected).toEqual(['aspect_ratio']);
    expect(templatePlan?.issues).toEqual([]);
  });

  test('shows a new input the model requires, so the Model stays valid', () => {
    const result = plan(schema({ strength: { type: 'number' } }, ['prompt', 'strength']));
    expect(result.model.fields.at(-1)).toEqual({ name: 'strength', mode: 'shown', order: 4 });
    expect(result.model.issues).toEqual([]);
  });

  test('removes options that no longer exist from narrowed lists and conditions, and a shown default that became invalid', () => {
    const result = plan(schema({ aspect_ratio: { type: 'string', enum: ['1:1', '9:16'] } }));
    const ratio = result.model.fields.find((field) => field.name === 'aspect_ratio');
    expect(ratio?.options).toEqual([{ value: '1:1', label: 'Square' }]);
    expect(ratio?.value).toBeUndefined();
    expect(result.model.fields.find((field) => field.name === 'num_images')?.visibleIf).toEqual({ field: 'aspect_ratio', in: ['1:1'] });
    expect(result.model.affected).toEqual(['aspect_ratio']);
    expect(result.model.issues).toEqual([]);
  });

  test('reports a fixed value that became invalid instead of changing it', () => {
    const result = plan(schema({ aspect_ratio: { type: 'string', enum: ['1:1', '9:16'] } }));
    const [templatePlan] = result.templates;
    expect(templatePlan?.fields.find((field) => field.name === 'aspect_ratio')?.value).toBe('16:9');
    expect(templatePlan?.issues).toEqual([{ field: 'aspect_ratio', message: 'The value is not one of the offered choices.' }]);
  });

  test('narrows a range back into the new schema range', () => {
    const result = plan(schema({ num_images: { type: 'integer', minimum: 2, maximum: 3 } }));
    const count = result.model.fields.find((field) => field.name === 'num_images');
    expect(count?.min).toBeUndefined();
    expect(count?.max).toBeUndefined();
    expect(result.model.issues).toEqual([]);
  });

  test('drops the settings a Field can no longer have after its type changed', () => {
    const result = plan(schema({ aspect_ratio: { type: 'string' } }));
    const ratio = result.model.fields.find((field) => field.name === 'aspect_ratio');
    expect(ratio).toEqual({ name: 'aspect_ratio', mode: 'shown', order: 2, value: '16:9' });
    expect(result.model.issues).toEqual([]);

    const noFiles = plan(schema({ image_urls: { type: 'integer' } }), []);
    expect(noFiles.model.fields.find((field) => field.name === 'image_urls')).toEqual({ name: 'image_urls', mode: 'shown', order: 1 });
    expect(noFiles.model.issues).toEqual([]);
  });

  test('drops file Variables of a removed input and text Variables whose text is gone, naming them', () => {
    const result = plan(schema({ image_urls: undefined, prompt: undefined }, []));
    const [templatePlan] = result.templates;
    expect(templatePlan?.variables).toEqual([]);
    expect(templatePlan?.affected).toEqual(['prompt', 'photo']);
    expect(result.model.affected).toEqual(['prompt', 'image_urls']);
  });

  test('names a file Variable whose input changed, and reports what no longer fits', () => {
    const result = plan(schema({ image_urls: { type: 'array', items: { type: 'string' }, maxItems: 1 } }), [
      { ...template, variables: [style, { ...photo, file: { field: 'image_urls', position: 1, accept: ['image'] } }] },
    ]);
    const [templatePlan] = result.templates;
    expect(templatePlan?.affected).toEqual(['photo']);
    expect(templatePlan?.issues).toEqual([{ field: 'photo', message: 'image_urls takes at most 1 files.' }]);
  });

  test('leaves configs that use nothing that changed as they are', () => {
    const result = plan(schema({ guidance: { type: 'number' } }));
    expect(result.model.affected).toEqual([]);
    expect(result.templates[0]?.affected).toEqual([]);
    expect(result.templates[0]?.variables).toEqual([style, photo]);
  });
});
