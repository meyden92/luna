import { describe, expect, test } from 'bun:test';
import { estimateCost } from './cost';
import type { JsonSchema, StudioPricing } from './types';

const schema: JsonSchema = {
  type: 'object',
  properties: { num_images: { type: 'integer', default: 2 }, duration: { type: 'string', enum: ['5', '10'] } },
};

describe('estimateCost', () => {
  test('a fixed quantity costs unit price times that quantity', () => {
    const pricing: StudioPricing = { unit: 'request', unitPrice: 0.035, currency: 'USD', quantity: { kind: 'fixed', value: 1 } };
    expect(estimateCost(pricing, {}, schema)).toBe(0.035);
  });

  test('a field quantity reads the value sent to fal, times the factor', () => {
    const perImage: StudioPricing = { unit: 'image', unitPrice: 0.025, currency: 'USD', quantity: { kind: 'field', field: 'num_images' } };
    expect(estimateCost(perImage, { num_images: 4 }, schema)).toBe(0.1);
    // Numeric strings count, as with fal's duration enums.
    const perSecond: StudioPricing = {
      unit: 'second',
      unitPrice: 0.07,
      currency: 'USD',
      quantity: { kind: 'field', field: 'duration', factor: 2 },
    };
    expect(estimateCost(perSecond, { duration: '10' }, schema)).toBe(1.4);
  });

  test('a field left at fal default is priced at the schema default, or as one unit', () => {
    const perImage: StudioPricing = { unit: 'image', unitPrice: 0.025, currency: 'USD', quantity: { kind: 'field', field: 'num_images' } };
    expect(estimateCost(perImage, {}, schema)).toBe(0.05);
    const unknownField: StudioPricing = { unit: 'image', unitPrice: 0.025, currency: 'USD', quantity: { kind: 'field', field: 'other' } };
    expect(estimateCost(unknownField, {}, schema)).toBe(0.025);
  });

  test('a Model without pricing has no estimate', () => {
    expect(estimateCost(null, {}, schema)).toBeNull();
  });
});
