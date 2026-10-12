import { z } from 'zod';

export const deleteFilesSchema = z.object({
  fileIds: z.union([z.string(), z.array(z.string())]),
});

/** A rename or retag from the Preview; whichever field is absent is left as it is. */
export const editFileSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

export const moveFilesToFolderSchema = z.object({
  fileIds: z.array(z.string()),
  folderId: z.string().nullable(),
});

export type DeleteFilesInput = z.infer<typeof deleteFilesSchema>;
export type EditFileInput = z.infer<typeof editFileSchema>;
export type MoveFilesToFolderInput = z.infer<typeof moveFilesToFolderSchema>;
