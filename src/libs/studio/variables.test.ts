import { describe, expect, test } from 'bun:test';
import type { FieldConfig, JsonSchema, VariableConfig } from './types';
import { parseVariables, reconcileVariables, substituteVariables, writeVariableTokens } from './variables';

describe('parseVariables', () => {
  test('finds text and choice Variables, once per name, in order', () => {
    expect(parseVariables('Turn {who} into {style: Anime | *Comic | Oil painting}, then {who} again')).toEqual([
      { name: 'who' },
      {
        name: 'style',
        options: [
          { value: 'Anime', isDefault: false },
          { value: 'Comic', isDefault: true },
          { value: 'Oil painting', isDefault: false },
        ],
      },
    ]);
  });

  test('takes the options from the first occurrence that has any', () => {
    expect(parseVariables('{style} and {style: A | B} and {style: C}')).toEqual([
      {
        name: 'style',
        options: [
          { value: 'A', isDefault: false },
          { value: 'B', isDefault: false },
        ],
      },
    ]);
  });

  test('a text without Variables, or with braces that are not Variables, has none', () => {
    expect(parseVariables('A plain prompt')).toEqual([]);
    expect(parseVariables('{"json": true} {Upper} {with space} {}')).toEqual([]);
  });
});

const schema: JsonSchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    image_urls: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
    image_url: { type: 'string' },
    num_images: { type: 'integer' },
  },
  required: ['prompt', 'image_urls'],
};

const promptField = (value: string): FieldConfig => ({ name: 'prompt', mode: 'fixed', value, order: 0 });

const style: VariableConfig = {
  name: 'style',
  kind: 'choice',
  required: true,
  default: 'comic book style',
  order: 0,
  options: [
    { label: 'Anime', value: 'anime style, cel shaded' },
    { label: 'Comic', value: 'comic book style' },
  ],
};

const promptOf = (result: ReturnType<typeof substituteVariables>) => result.fields.find((field) => field.name === 'prompt')?.value;

describe('substituteVariables', () => {
  test('leaves Fields without Variables untouched', () => {
    const fields = [promptField('A cat'), { name: 'num_images', mode: 'shown', order: 1 } as FieldConfig];
    expect(substituteVariables({ fields, variables: [], values: { num_images: 2 }, schema })).toEqual({
      fields,
      variableValues: {},
      issues: [],
    });
  });

  test('a choice inserts its option value, in every occurrence', () => {
    const result = substituteVariables({
      fields: [promptField('Turn the person into {style: Anime | *Comic}. Keep it {style}.')],
      variables: [style],
      values: { style: 'anime style, cel shaded' },
      schema,
    });
    expect(promptOf(result)).toBe('Turn the person into anime style, cel shaded. Keep it anime style, cel shaded.');
    expect(result.issues).toEqual([]);
  });

  test('multi-choice joins its values, a switch inserts on or off, a number its value, text as typed', () => {
    const variables: VariableConfig[] = [
      {
        name: 'moods',
        kind: 'multi',
        required: false,
        order: 0,
        options: [
          { label: 'Calm', value: 'calm' },
          { label: 'Dark', value: 'dark' },
        ],
      },
      { name: 'hd', kind: 'switch', required: false, order: 1, switch: { on: 'in 4k', off: 'as a sketch' } },
      { name: 'age', kind: 'number', required: false, order: 2, number: { min: 1, max: 99, step: 1, display: 'slider' } },
      { name: 'who', kind: 'text', required: true, order: 3 },
    ];
    const result = substituteVariables({
      fields: [promptField('{who}, {age} years, {moods}, {hd}')],
      variables,
      values: { moods: ['calm', 'dark'], hd: false, age: 30, who: 'A sailor' },
      schema,
    });
    expect(promptOf(result)).toBe('A sailor, 30 years, calm, dark, as a sketch');
  });

  test('empty optional values leave no doubled spaces or dangling commas', () => {
    const result = substituteVariables({
      fields: [promptField('A portrait {extra}, {moods}, lit softly {more}')],
      variables: [
        { name: 'extra', kind: 'text', required: false, order: 0 },
        { name: 'moods', kind: 'multi', required: false, order: 1, options: [{ label: 'Calm', value: 'calm' }] },
        { name: 'more', kind: 'text', required: false, order: 2 },
      ],
      values: { moods: [] },
      schema,
    });
    expect(promptOf(result)).toBe('A portrait, lit softly');
  });

  test('a hidden Variable inserts its default or nothing, and is not validated', () => {
    const result = substituteVariables({
      fields: [promptField('{who} {style} {extra}')],
      variables: [
        { name: 'who', kind: 'text', required: true, order: 0, default: 'A knight', visibleIf: { field: 'detailed', in: [true] } },
        { ...style, visibleIf: { field: 'detailed', in: [true] } },
        { name: 'extra', kind: 'text', required: true, order: 2, visibleIf: { field: 'detailed', in: [true] } },
        { name: 'detailed', kind: 'switch', required: false, order: 3, default: false, switch: { on: '', off: '' } },
      ],
      values: { style: 'anime style, cel shaded', extra: 'ignored' },
      schema,
    });
    expect(promptOf(result)).toBe('A knight comic book style');
    expect(result.issues).toEqual([]);
    expect(result.variableValues).toEqual({ detailed: false });
  });

  test('file Variables feed their input: a single file, or positions of a list with empty ones left out', () => {
    const person = { source: 'upload', key: 'person' } as const;
    const outfit = { source: 'file', fileId: 'f1' } as const;
    const fileVariable = (name: string, field: string, position?: number): VariableConfig => ({
      name,
      kind: 'file',
      required: false,
      order: 0,
      file: { field, accept: ['image'], ...(position === undefined ? {} : { position }) },
    });
    const result = substituteVariables({
      fields: [
        promptField('Dress them'),
        { name: 'image_urls', mode: 'default', order: 1 },
        { name: 'image_url', mode: 'default', order: 2 },
      ],
      variables: [
        fileVariable('outfit', 'image_urls', 2),
        fileVariable('person', 'image_urls', 0),
        fileVariable('scarf', 'image_urls', 1),
        fileVariable('mask', 'image_url'),
      ],
      values: { person, outfit, mask: person },
      schema,
    });
    expect(result.fields.find((field) => field.name === 'image_urls')).toMatchObject({
      mode: 'fixed',
      value: [person, outfit],
      display: 'file',
    });
    expect(result.fields.find((field) => field.name === 'image_url')).toMatchObject({ mode: 'fixed', value: person, display: 'file' });
  });

  test('reports a required Variable left empty and a value outside its choices, by label', () => {
    const result = substituteVariables({
      fields: [promptField('{who} as {style}')],
      variables: [{ name: 'who', kind: 'text', label: 'Person', required: true, order: 0 }, style],
      values: { style: 'watercolor' },
      schema,
    });
    expect(result.issues).toEqual([
      { field: 'who', message: 'Person is required.' },
      { field: 'style', message: 'Style is not one of the offered choices.' },
    ]);
  });
});

describe('reconcileVariables', () => {
  test('creates a card per new name, keeps existing cards, and drops names no text uses', () => {
    const kept: VariableConfig = { name: 'who', kind: 'text', label: 'Person', required: true, order: 0 };
    const gone: VariableConfig = { name: 'old', kind: 'text', required: false, order: 1 };
    expect(reconcileVariables(['{who} as {style: Anime | *Comic}', 'and {extra}'], [kept, gone])).toEqual([
      kept,
      {
        name: 'style',
        kind: 'choice',
        required: false,
        order: 1,
        default: 'Comic',
        options: [
          { label: '', value: 'Anime' },
          { label: '', value: 'Comic' },
        ],
      },
      { name: 'extra', kind: 'text', required: false, order: 2 },
    ]);
  });

  test('choice options come from the text and keep their labels by value; file Variables stay', () => {
    const style: VariableConfig = {
      name: 'style',
      kind: 'multi',
      required: false,
      order: 0,
      default: ['Anime'],
      options: [
        { label: 'Zeichentrick', value: 'Anime' },
        { label: 'Gone', value: 'Oil' },
      ],
    };
    const photo: VariableConfig = {
      name: 'photo',
      kind: 'file',
      required: true,
      order: 1,
      file: { field: 'image_urls', position: 0, accept: ['image'] },
    };
    expect(reconcileVariables(['{style: Anime | *Comic | *Pixel}'], [style, photo])).toEqual([
      {
        ...style,
        default: ['Comic', 'Pixel'],
        options: [
          { label: 'Zeichentrick', value: 'Anime' },
          { label: '', value: 'Comic' },
          { label: '', value: 'Pixel' },
        ],
      },
      photo,
    ]);
  });

  test('an option whose value is being retyped (empty) keeps its row while the text still matches', () => {
    const card: VariableConfig = {
      name: 'style',
      kind: 'choice',
      required: false,
      order: 0,
      options: [
        { label: 'Anime', value: '' },
        { label: '', value: 'Comic' },
      ],
    };
    const [written] = writeVariableTokens(['{style}'], card);
    expect(written).toBe('{style: Comic}');
    expect(reconcileVariables([written as string], [card])).toEqual([card]);
  });

  test('options typed for a text card make it a choice', () => {
    const [card] = reconcileVariables(['{style: A | B}'], [{ name: 'style', kind: 'text', required: false, order: 0 }]);
    expect(card).toMatchObject({ kind: 'choice', options: [{ value: 'A' }, { value: 'B' }] });
  });
});

describe('writeVariableTokens', () => {
  const choice = (options: string[], fallback?: string): VariableConfig => ({
    name: 'style',
    kind: 'choice',
    required: false,
    order: 0,
    ...(fallback === undefined ? {} : { default: fallback }),
    options: options.map((value) => ({ label: '', value })),
  });

  test("rewrites the first occurrence with the card's options and default, and the others as plain names", () => {
    expect(
      writeVariableTokens(['Be {style}', 'Like {style: Anime | *Comic} or {style: X}'], choice(['Anime', 'Manga', 'Comic'], 'Manga')),
    ).toEqual(['Be {style: Anime | *Manga | Comic}', 'Like {style} or {style}']);
  });

  test('a card that no longer has options leaves plain names, and other Variables are untouched', () => {
    const text: VariableConfig = { name: 'style', kind: 'text', required: false, order: 0 };
    expect(writeVariableTokens(['{style: A | *B} by {who: X | Y}'], text)).toEqual(['{style} by {who: X | Y}']);
  });

  test('round-trips through parseVariables', () => {
    const multi: VariableConfig = { ...choice(['A', 'B', 'C']), kind: 'multi', default: ['A', 'C'] };
    const [written] = writeVariableTokens(['{style}'], multi);
    expect(reconcileVariables([written as string], [multi])).toEqual([multi]);
  });
});
