import { z } from 'zod';

export const permanentlyDeleteFilesSchema = z.object({
  fileIds: z.array(z.string()).min(1, 'At least one file ID is required'),
});

export const restoreFilesSchema = z.object({
  fileIds: z.array(z.string()).min(1, 'At least one file ID is required'),
});

export type PermanentlyDeleteFilesInput = z.infer<typeof permanentlyDeleteFilesSchema>;
export type RestoreFilesInput = z.infer<typeof restoreFilesSchema>;
