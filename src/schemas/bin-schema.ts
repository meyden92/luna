import { z } from 'zod';

export const createBinSchema = z.object({
  title: z.string(),
  snippet: z.string(),
  language: z.string().nullish(),
  isPublic: z.boolean().default(false),
});

export const updateBinSchema = z.object({
  id: z.string(),
  title: z.string().min(3).max(40),
  content: z.string().min(10),
  language: z.string().nullish(),
  isPublic: z.boolean().optional(),
});

export const deleteBinSchema = z.object({
  id: z.string(),
});

export type CreateBinInput = z.infer<typeof createBinSchema>;
export type UpdateBinInput = z.infer<typeof updateBinSchema>;
export type DeleteBinInput = z.infer<typeof deleteBinSchema>;
