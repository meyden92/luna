import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// The DB logic lives in @/libs/oembed-data and is loaded via a dynamic import
// inside the handler so it is stripped from the client bundle (the handler body
// is replaced by an RPC stub on the client).
export const getPublicEmbedFile = createServerFn({ method: 'GET' })
  .validator(z.string().min(1))
  .handler(async ({ data: id }) => {
    const { findPublicEmbedFile } = await import('@/libs/oembed-data');
    return findPublicEmbedFile(id);
  });
