import { z } from 'zod';

export const modelFieldSchema = z.object({
  name: z.string().min(1, 'Field name is required'),
  label: z.string().min(1, 'Field label is required'),
  type: z.enum(['string', 'number', 'boolean', 'enum']),
  description: z.string().nullable().optional(),
  isRequired: z.boolean(),
  defaultValue: z.string().nullable().optional(),
  minValue: z.string().nullable().optional(),
  maxValue: z.string().nullable().optional(),
  step: z.string().nullable().optional(),
  enumOptions: z.string().nullable().optional(),
  isReadonly: z.boolean(),
  isTextarea: z.boolean().optional(),
  isSlider: z.boolean().optional(),
  showCharCount: z.boolean().optional(),
  sortOrder: z.number(),
});

export const createModelSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  description: z.string().optional(),
  apiModelName: z.string().min(1, 'API model name is required'),
  isActive: z.boolean().default(true),
  sortOrder: z.number().default(0),
  fields: z.array(modelFieldSchema).default([]),
});

export const updateModelSchema = z.object({
  id: z.string(),
  label: z.string().min(1, 'Label is required'),
  description: z.string().optional(),
  apiModelName: z.string().min(1, 'API model name is required'),
  isActive: z.boolean(),
  sortOrder: z.number(),
  fields: z.array(modelFieldSchema).default([]),
});

export const deleteModelSchema = z.object({
  id: z.string(),
});

export type ModelFieldInput = z.infer<typeof modelFieldSchema>;
export type CreateModelInput = z.infer<typeof createModelSchema>;
export type UpdateModelInput = z.infer<typeof updateModelSchema>;
export type DeleteModelInput = z.infer<typeof deleteModelSchema>;
