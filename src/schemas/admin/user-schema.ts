import { z } from 'zod';

export const suspendUserSchema = z.object({
  id: z.string(),
});

export const reactivateUserSchema = z.object({
  id: z.string(),
});

export const deleteUserSchema = z.object({
  id: z.string(),
});

export const deleteUserFileSchema = z.object({
  fileId: z.string(),
  userId: z.string(),
});

export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
export type ReactivateUserInput = z.infer<typeof reactivateUserSchema>;
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;
export type DeleteUserFileInput = z.infer<typeof deleteUserFileSchema>;
