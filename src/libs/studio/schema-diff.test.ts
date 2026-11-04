import { describe, expect, test } from 'bun:test';
import { describeSchemaDiff, diffInputSchemas } from './schema-diff';
import type { JsonSchema } from './types';

// fake/image's resolved input.
const before: JsonSchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16'], default: '1:1' },
    num_images: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
    seed: { type: 'integer' },
  },
  required: ['prompt'],
};

const withProperties = (properties: Record<string, JsonSchema | undefined>, required = before.required): JsonSchema => {
  const merged = { ...before.properties, ...properties };
  return {
    ...before,
    properties: Object.fromEntries(Object.entries(merged).filter((entry): entry is [string, JsonSchema] => entry[1] !== undefined)),
    required,
  };
};

describe('diffInputSchemas', () => {
  test('finds no difference between equal schemas, whatever their descriptions and defaults say', () => {
    const after = withProperties({ num_images: { type: 'integer', minimum: 1, maximum: 4, default: 2, description: 'How many.' } });
    expect(diffInputSchemas(before, after)).toEqual({ added: [], removed: [], changed: [] });
  });

  test('lists added and removed properties', () => {
    const after = withProperties({ aspect_ratio: undefined, guidance: { type: 'number' } });
    expect(diffInputSchemas(before, after)).toEqual({ added: ['guidance'], removed: ['aspect_ratio'], changed: [] });
  });

  test('reports a changed type', () => {
    const after = withProperties({ seed: { type: 'string' } });
    expect(diffInputSchemas(before, after).changed).toEqual([{ name: 'seed', kind: { before: 'integer', after: 'string' } }]);
  });

  test('reports enum options added and removed', () => {
    const after = withProperties({ aspect_ratio: { type: 'string', enum: ['1:1', '9:16', '21:9'] } });
    expect(diffInputSchemas(before, after).changed).toEqual([{ name: 'aspect_ratio', optionsAdded: ['21:9'], optionsRemoved: ['16:9'] }]);
  });

  test('reports a changed minimum and maximum, also of a list', () => {
    const lists = { image_urls: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 } };
    const after = withProperties({
      num_images: { type: 'integer', minimum: 1, maximum: 8 },
      image_urls: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    });
    expect(diffInputSchemas(withProperties(lists), after).changed).toEqual([
      { name: 'num_images', range: [{ bound: 'maximum', before: 4, after: 8 }] },
      {
        name: 'image_urls',
        range: [
          { bound: 'minItems', before: 1 },
          { bound: 'maxItems', before: 4, after: 2 },
        ],
      },
    ]);
  });

  test('reports required added and removed', () => {
    const after = withProperties({}, ['seed']);
    expect(diffInputSchemas(before, after).changed).toEqual([
      { name: 'prompt', required: 'removed' },
      { name: 'seed', required: 'added' },
    ]);
  });

  test('reads a property through its nullable anyOf, as the Field cards do', () => {
    const after = withProperties({ seed: { anyOf: [{ type: 'integer' }, { type: 'null' }] } });
    expect(diffInputSchemas(before, after).changed).toEqual([]);
  });
});

describe('describeSchemaDiff', () => {
  test('says what changed in plain words', () => {
    const after = withProperties(
      {
        aspect_ratio: undefined,
        guidance: { type: 'number' },
        seed: { type: 'string' },
        num_images: { type: 'integer', minimum: 2 },
        style: { type: 'string', enum: ['photo', 'comic'] },
      },
      ['prompt', 'seed'],
    );
    const withStyle = withProperties({ style: { type: 'string', enum: ['photo', 'anime'] } });
    expect(describeSchemaDiff(diffInputSchemas(withStyle, after))).toEqual([
      'New input: guidance.',
      'Removed input: aspect_ratio.',
      'num_images: the minimum changed from 1 to 2; the maximum of 4 was removed.',
      'seed: changed from a whole number to text; now required.',
      'style: new option comic; option anime removed.',
    ]);
  });
});
