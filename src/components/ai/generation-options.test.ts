import { describe, expect, test } from 'bun:test';
import { presetFieldValues, presetValuesFromFieldValues } from './generation-options';

const field = (name: string, maxValue: string | null = null) => ({ name, type: 'number', defaultValue: null, minValue: null, maxValue });

describe('presets', () => {
  test('a saved preset reads back into the same Create values', () => {
    const fields = [
      field('prompt'),
      field('width'),
      field('height'),
      field('num_inference_steps'),
      field('seed'),
      field('num_outputs', '4'),
    ];
    const saved = presetFieldValues(fields, { shape: '16:9', count: 4, steps: 16, seed: '42' });

    expect(saved.prompt).toBeUndefined();
    expect(presetValuesFromFieldValues(saved)).toEqual({ shape: '16:9', count: 4, steps: 16, seed: '42' });
  });

  test('controls the model has no field for are left alone, and no seed means random', () => {
    const saved = presetFieldValues([field('prompt'), field('aspect_ratio')], { shape: '3:4', count: 2, steps: 8, seed: '' });

    expect(presetValuesFromFieldValues(saved)).toEqual({ shape: '3:4', count: undefined, steps: undefined, seed: '' });
  });
});
