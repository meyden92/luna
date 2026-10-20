import { z } from 'zod';

/** The Downloader's link field. Whether the link names a supported post is checked on the server. */
export const createDownloadSchema = z.object({
  url: z.string().trim().pipe(z.url('Paste a link')),
});

export const downloadIdSchema = z.object({
  id: z.uuid(),
});

export type CreateDownloadInput = z.infer<typeof createDownloadSchema>;
