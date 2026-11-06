import { describe, expect, test } from 'bun:test';
import { templateFieldDefaults, validateTemplateConfig } from './template-config';
import type { FieldConfig, JsonSchema, VariableConfig } from './types';

// fake/edit's input: a prompt and a required list of 1-4 images.
const input: JsonSchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    image_urls: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
    strength: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
  },
  required: ['prompt', 'image_urls'],
};

const prompt = (value: string): FieldConfig => ({ name: 'prompt', mode: 'fixed', value, order: 0 });
const images: FieldConfig = { name: 'image_urls', mode: 'default', order: 1, display: 'file', accept: ['image'] };
const strength: FieldConfig = { name: 'strength', mode: 'default', order: 2 };
const photo: VariableConfig = {
  name: 'photo',
  kind: 'file',
  required: true,
  order: 1,
  file: { field: 'image_urls', position: 0, accept: ['image'] },
};
const style: VariableConfig = {
  name: 'style',
  kind: 'choice',
  required: true,
  order: 0,
  default: 'Comic',
  options: [
    { label: 'Anime', value: 'Anime' },
    { label: 'Comic book', value: 'Comic' },
  ],
};

const messages = (fields: FieldConfig[], variables: VariableConfig[]) =>
  validateTemplateConfig({ fields, variables, input }).map((issue) => `${issue.field}: ${issue.message}`);

describe('validateTemplateConfig', () => {
  test('a Template whose texts, cards and file inputs agree has no issues', () => {
    expect(messages([prompt('Turn the person into {style: Anime | *Comic}'), images, strength], [style, photo])).toEqual([]);
  });

  test('every Variable a text uses needs a card, and every card a text that uses it', () => {
    const unused: VariableConfig = { name: 'mood', kind: 'text', required: false, order: 2 };
    expect(messages([prompt('Turn into {style} and {extra}'), images, strength], [style, photo, unused])).toEqual([
      'prompt: Uses {extra}, which has no Variable card.',
      'mood: No text uses {mood}.',
    ]);
  });

  test("a choice's default must be one of its options", () => {
    expect(messages([prompt('{style}'), images, strength], [{ ...style, default: 'Oil' }, photo])).toEqual([
      'style: The default Oil is not one of the options.',
    ]);
  });

  test('Shown only when must name an existing Field or Variable', () => {
    const hidden: VariableConfig = { name: 'extra', kind: 'text', required: false, order: 2, visibleIf: { field: 'detail', in: [true] } };
    const shownStrength: FieldConfig = { ...strength, mode: 'shown', visibleIf: { field: 'style', in: ['Comic'] } };
    expect(messages([prompt('{style} {extra}'), images, shownStrength], [style, photo, hidden])).toEqual([
      'extra: Shown only when references detail, which is not a Field or Variable.',
    ]);
  });

  test('a required file input must be shown or fed by a required file Variable', () => {
    expect(messages([prompt('{style}'), images, strength], [style])).toEqual([
      'image_urls: The model requires this input, so it must be shown or fixed.',
    ]);
    expect(messages([prompt('{style}'), images, strength], [style, { ...photo, required: false }])).toEqual([
      'photo: The model requires image_urls, so this file input must be required.',
    ]);
  });

  test('a file input a file Variable feeds needs no mode of its own: shown or fal default, it is valid', () => {
    expect(messages([prompt('{style}'), { ...images, mode: 'shown' }, strength], [style, photo])).toEqual([]);
  });

  test("two file Variables cannot feed the same place, nor a position past the input's limit", () => {
    const twin: VariableConfig = { ...photo, name: 'twin' };
    const far: VariableConfig = { ...photo, name: 'far', file: { field: 'image_urls', position: 4, accept: ['image'] } };
    expect(messages([prompt('{style}'), images, strength], [style, photo, twin, far])).toEqual([
      'far: image_urls takes at most 4 files.',
      'twin: Another file Variable already feeds position 1 of image_urls.',
    ]);
  });

  test('a Variable cannot share its name with an input of the model', () => {
    expect(
      messages([prompt('{strength}'), images, strength], [{ name: 'strength', kind: 'text', required: false, order: 0 }, photo]),
    ).toEqual(['strength: strength is also an input of the model. Rename the Variable.']);
  });
});

describe('templateFieldDefaults', () => {
  const modelFields: FieldConfig[] = [
    { name: 'prompt', mode: 'shown', order: 0, label: 'Prompt' },
    { name: 'image_urls', mode: 'shown', order: 1, display: 'file', accept: ['image'] },
    { name: 'strength', mode: 'shown', order: 2, value: 0.7 },
  ];

  test("fixes the Model's shown Fields at its values, and keeps file inputs shown", () => {
    expect(templateFieldDefaults(modelFields, input)).toEqual([
      { name: 'prompt', mode: 'fixed', order: 0, label: 'Prompt' },
      { name: 'image_urls', mode: 'shown', order: 1, display: 'file', accept: ['image'] },
      { name: 'strength', mode: 'fixed', order: 2, value: 0.7 },
    ]);
  });

  test("fixes a Generation's values in place of the Model's", () => {
    const values = { prompt: 'A red fox', strength: 0.2, image_urls: [{ source: 'file', fileId: 'f1' }] };
    expect(templateFieldDefaults(modelFields, input, values).map((field) => [field.name, field.mode, field.value])).toEqual([
      ['prompt', 'fixed', 'A red fox'],
      ['image_urls', 'shown', undefined],
      ['strength', 'fixed', 0.2],
    ]);
  });
});
