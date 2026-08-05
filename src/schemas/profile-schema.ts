import { z } from 'zod';

export const updateProfileSchema = z.object({
  receiveEmails: z.boolean(),
  isProfilePublic: z.boolean(),
  bio: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  showAllFilesIncludesFoldered: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
