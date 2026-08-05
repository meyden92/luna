import { z } from 'zod';

export const deleteFilesSchema = z.object({
  fileIds: z.union([z.string(), z.array(z.string())]),
});

export const editFileSchema = z.object({
  id: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  lyrics: z.string().optional(),
  artist: z.string().optional(),
  visible: z.boolean(),
});

export const moveFilesToFolderSchema = z.object({
  fileIds: z.array(z.string()),
  folderId: z.string().nullable(),
});

export type DeleteFilesInput = z.infer<typeof deleteFilesSchema>;
export type EditFileInput = z.infer<typeof editFileSchema>;
export type MoveFilesToFolderInput = z.infer<typeof moveFilesToFolderSchema>;
