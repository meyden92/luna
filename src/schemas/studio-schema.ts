import { z } from 'zod';
import { CATEGORY_ICONS } from '@/libs/studio/category-icons';
import { type FieldConfig, MEDIA_KINDS, type MediaKind, type StudioPricing, type VariableConfig } from '@/libs/studio/types';

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
  accept: z.array(z.enum(MEDIA_KINDS as [MediaKind, ...MediaKind[]])).optional(),
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

export const variableConfigSchema = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(['text', 'choice', 'multi', 'number', 'switch', 'file']),
  label: z.string().max(120).optional(),
  help: z.string().max(500).optional(),
  required: z.boolean(),
  default: z.json().optional(),
  group: z.string().max(60).optional(),
  order: z.number().int(),
  visibleIf: visibleIfSchema.optional(),
  text: z
    .object({ multiline: z.boolean(), placeholder: z.string().max(200).optional(), maxLength: z.number().int().optional() })
    .optional(),
  options: z
    .array(z.object({ label: z.string().max(120), value: z.string().max(2000) }))
    .max(50)
    .optional(),
  number: z.object({ min: z.number(), max: z.number(), step: z.number(), display: z.enum(['slider', 'number']) }).optional(),
  switch: z.object({ on: z.string().max(2000), off: z.string().max(2000) }).optional(),
  file: z
    .object({
      field: z.string().min(1),
      position: z.number().int().optional(),
      accept: z.array(z.enum(MEDIA_KINDS as [MediaKind, ...MediaKind[]])),
    })
    .optional(),
}) satisfies z.ZodType<VariableConfig>;

/** A Template preview image: one it already has, a new upload (a FormData part), or one of the admin's own Outputs. */
export const templatePreviewSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('key'), key: z.string().min(1) }),
  z.object({ source: z.literal('upload'), key: z.string().min(1) }),
  z.object({ source: z.literal('output'), outputId: z.string().min(1) }),
]);

export type TemplatePreview = z.infer<typeof templatePreviewSchema>;

/** The Template editor's save; without `id` it creates the Template. */
export const saveStudioTemplateSchema = z.object({
  id: z.string().min(1).optional(),
  modelId: z.string().min(1),
  categoryId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable(),
  isActive: z.boolean(),
  fields: z.array(fieldConfigSchema),
  variables: z.array(variableConfigSchema).max(50),
  previews: z.array(templatePreviewSchema).max(6),
});

export type SaveStudioTemplateInput = z.infer<typeof saveStudioTemplateSchema>;
