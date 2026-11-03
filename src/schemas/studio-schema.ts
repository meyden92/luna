import { z } from 'zod';
import { CATEGORY_ICONS } from '@/libs/studio/category-icons';
import type { FieldConfig, StudioPricing } from '@/libs/studio/types';

export const studioCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.enum(CATEGORY_ICONS),
});

const visibleIfSchema = z.object({ field: z.string().min(1), in: z.array(z.json()).min(1) });

export const fieldConfigSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(['shown', 'fixed', 'default']),
  label: z.string().max(120).optional(),
  help: z.string().max(500).optional(),
  value: z.json().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string().max(120) })).optional(),
  display: z.enum(['slider', 'number', 'chips', 'select', 'text', 'textarea', 'switch', 'file']).optional(),
  accept: z.array(z.enum(['image', 'video', 'audio', 'model3d'])).optional(),
  group: z.string().max(60).optional(),
  order: z.number().int(),
  visibleIf: visibleIfSchema.optional(),
}) satisfies z.ZodType<FieldConfig>;

const pricingQuantitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), value: z.number().positive() }),
  z.object({ kind: z.literal('field'), field: z.string().min(1), factor: z.number().positive().optional() }),
]) satisfies z.ZodType<StudioPricing['quantity']>;

/** The Model editor's save. Unit and price stay as fal stated them; only the quantity mapping is the admin's. */
export const updateStudioModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable(),
  categoryId: z.string().min(1),
  isActive: z.boolean(),
  fields: z.array(fieldConfigSchema),
  quantity: pricingQuantitySchema.nullable(),
});

export type UpdateStudioModelInput = z.infer<typeof updateStudioModelSchema>;
