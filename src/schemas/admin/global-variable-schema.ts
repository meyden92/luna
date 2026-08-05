import { z } from 'zod';
import { templateVariableOptionSchema } from '@/schemas/template-schema';

export const globalVariableFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Variable name is required')
    .regex(/^[a-zA-Z0-9_]+$/, 'Variable name must contain only letters, numbers, and underscores'),
  label: z.string().min(1, 'Label is required'),
  type: z.enum(['text', 'number', 'dropdown', 'boolean']),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  options: z.array(templateVariableOptionSchema).optional(),
  required: z.boolean().optional(),
});

export type GlobalVariableFormData = z.infer<typeof globalVariableFormSchema>;
