import { z } from 'zod';

export const updateLocaleSchema = z.object({
  locale: z.enum(['en', 'de']),
});

export type UpdateLocaleInput = z.infer<typeof updateLocaleSchema>;
