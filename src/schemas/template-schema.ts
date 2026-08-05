import { z } from 'zod';
import { UPLOAD_CONFIG } from '@/config/upload-config';
import { validateTemplateVariablesInPrompt } from '@/libs/template-variable-validation';

export const templateVariableOptionSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1, 'Label is required'),
  value: z.string().min(1, 'Value is required'),
  enabled: z.boolean().optional(),
  previewUrl: z.string().optional(),
  previewSize: z.enum(['small', 'default', 'large', 'raw']).optional(),
});

export const templateVariableSchema = z.object({
  id: z.string().optional(),
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
  enabled: z.boolean().optional(),
  previewUrl: z.string().optional(),
  previewSize: z.enum(['small', 'default', 'large', 'raw']).optional(),
  globalVariableId: z.string().optional(),
});

export const templateFormSchema = z
  .object({
    name: z
      .string()
      .min(UPLOAD_CONFIG.MIN_NAME_LENGTH, `Name must be at least ${UPLOAD_CONFIG.MIN_NAME_LENGTH} characters`)
      .max(UPLOAD_CONFIG.MAX_NAME_LENGTH, `Name must be less than ${UPLOAD_CONFIG.MAX_NAME_LENGTH} characters`),
    description: z
      .string()
      .max(UPLOAD_CONFIG.MAX_DESCRIPTION_LENGTH, `Description must be less than ${UPLOAD_CONFIG.MAX_DESCRIPTION_LENGTH} characters`)
      .optional(),
    prompt: z
      .string()
      .min(UPLOAD_CONFIG.MIN_PROMPT_LENGTH, `Prompt must be at least ${UPLOAD_CONFIG.MIN_PROMPT_LENGTH} characters`)
      .max(UPLOAD_CONFIG.MAX_PROMPT_LENGTH, `Prompt must be less than ${UPLOAD_CONFIG.MAX_PROMPT_LENGTH} characters`),
    inputImageCount: z.number().int().min(1).max(4),
    minImageCount: z.number().int().min(1).max(4),
    maxImageCount: z.number().int().min(1).max(4),
    editingModelId: z.string().min(1, 'Editing model is required'),
    isActive: z.boolean(),
    variables: z.array(templateVariableSchema),
    editingModelFieldValues: z.record(z.string(), z.unknown()),
    // UI fields that might be mapped to editingModelFieldValues or future DB columns
    previewImage: z.unknown().optional(),
  })
  .refine((data) => data.minImageCount <= data.maxImageCount, {
    message: 'Min image count cannot be greater than max image count',
    path: ['minImageCount'],
  })
  .superRefine((data, ctx) => {
    const { missing, invalidDropdowns } = validateTemplateVariablesInPrompt(data.variables, data.prompt);

    if (missing.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['prompt'],
        message: `Prompt contains undefined variables: ${missing.join(', ')}`,
      });
    }

    if (invalidDropdowns.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['variables'],
        message: `Dropdown variables require valid options: ${invalidDropdowns.join(', ')}`,
      });
    }
  });

export type TemplateFormValues = z.infer<typeof templateFormSchema>;
