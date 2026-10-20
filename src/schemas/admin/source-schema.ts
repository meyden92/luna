import { z } from 'zod';

/** A Source, by its registry key. */
export const sourceKeySchema = z.object({
  sourceKey: z.string().min(1),
});

/** The Replace dialog: a pasted or uploaded cookies.txt. Its format is checked on the server, against the Source's domain. */
export const setSourceSessionSchema = sourceKeySchema.extend({
  cookies: z.string().trim().min(1, 'Paste or upload a cookies.txt file'),
});

export type SetSourceSessionInput = z.infer<typeof setSourceSessionSchema>;
