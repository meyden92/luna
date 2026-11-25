import { z } from 'zod';

export const deleteS3OnlyFilesSchema = z.object({
  fileKeys: z.array(z.string()),
});

export const insertS3OnlyFilesToDbSchema = z.object({
  files: z.array(
    z.object({
      key: z.string(),
      fileName: z.string(),
      size: z.number(),
      lastModified: z.coerce.date(),
    }),
  ),
  targetUserId: z.string(),
});

export const deleteDbOnlyFilesSchema = z.object({
  fileIds: z.array(z.string()),
});

export const addSyncExcludedPathSchema = z.object({
  pattern: z.string().trim().min(1).max(512),
});

export const removeSyncExcludedPathSchema = z.object({
  id: z.string().min(1),
});

export type DeleteS3OnlyFilesInput = z.infer<typeof deleteS3OnlyFilesSchema>;
export type InsertS3OnlyFilesToDbInput = z.infer<typeof insertS3OnlyFilesToDbSchema>;
export type DeleteDbOnlyFilesInput = z.infer<typeof deleteDbOnlyFilesSchema>;
