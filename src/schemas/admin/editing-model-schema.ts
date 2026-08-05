import { z } from 'zod';

export const editingModelFieldSchema = z.object({
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

export const createEditingModelSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  description: z.string().optional(),
  apiModelName: z.string().min(1, 'API model name is required'),
  imageInputField: z.string().default('image_input'),
  isActive: z.boolean().default(true),
  sortOrder: z.number().default(0),
  fields: z.array(editingModelFieldSchema).default([]),
});

export const updateEditingModelSchema = z.object({
  id: z.string(),
  label: z.string().min(1, 'Label is required'),
  description: z.string().optional(),
  apiModelName: z.string().min(1, 'API model name is required'),
  imageInputField: z.string().default('image_input'),
  isActive: z.boolean(),
  sortOrder: z.number(),
  fields: z.array(editingModelFieldSchema).default([]),
});

export const deleteEditingModelSchema = z.object({
  id: z.string(),
});

export type EditingModelFieldInput = z.infer<typeof editingModelFieldSchema>;
export type CreateEditingModelInput = z.infer<typeof createEditingModelSchema>;
export type UpdateEditingModelInput = z.infer<typeof updateEditingModelSchema>;
export type DeleteEditingModelInput = z.infer<typeof deleteEditingModelSchema>;
