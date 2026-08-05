import { z } from 'zod';

export const formShareFieldSchema = z.object({
  label: z.string().min(1).max(200),
  value: z.string().max(10000),
  type: z.enum(['text', 'password', 'email', 'url', 'number', 'textarea', 'hidden']),
  isSensitive: z.boolean().default(false),
});

export const createFormShareSchema = z.object({
  title: z.string().max(200).optional(),
  fields: z.array(formShareFieldSchema).min(1).max(50),
  expiresInMs: z.number().int().positive().optional(),
  maxViews: z.number().int().positive().optional(),
});

export const deleteFormShareSchema = z.object({
  id: z.string(),
});

export type FormShareFieldInput = z.infer<typeof formShareFieldSchema>;
export type CreateFormShareInput = z.infer<typeof createFormShareSchema>;
export type DeleteFormShareInput = z.infer<typeof deleteFormShareSchema>;
