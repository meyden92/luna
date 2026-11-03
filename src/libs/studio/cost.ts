import type { JsonSchema, StudioPricing } from './types';

/**
 * Estimates a Generation's cost in USD: the Model's unit price times the
 * quantity, which is fixed or read from the value sent to fal (a Field left at
 * fal's default counts with the schema default, else as one unit). Null when
 * the Model has no pricing. Rounded to the micro-dollar the database stores.
 */
export function estimateCost(pricing: StudioPricing | null, requestInput: Record<string, unknown>, schema: JsonSchema): number | null {
  if (!pricing) return null;
  const { quantity } = pricing;
  let units = 1;
  if (quantity.kind === 'fixed') units = quantity.value;
  else {
    const value = Number(requestInput[quantity.field] ?? schema.properties?.[quantity.field]?.default ?? 1);
    units = (Number.isFinite(value) ? value : 1) * (quantity.factor ?? 1);
  }
  return Math.round(pricing.unitPrice * units * 1e6) / 1e6;
}
