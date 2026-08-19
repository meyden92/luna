import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createSnippet, deleteOwnedSnippet, getOwnedSnippet, listOwnedSnippets, updateOwnedSnippet } from '@/db/queries/features';
import { detectLanguage } from '@/libs/language-detection';
import { createBinSchema, updateBinSchema } from '@/schemas/bin-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const listBins = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => listOwnedSnippets(userIdFromCtx(context)));

const binIdSchema = z.object({ id: z.string().min(1) });

export const getBin = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(binIdSchema)
  .handler(async ({ data, context }) => {
    const bin = await getOwnedSnippet(data.id, userIdFromCtx(context));
    if (!bin) throw new Error('Bin not found');
    return bin;
  });

export const createBin = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createBinSchema)
  .handler(async ({ data, context }) => {
    const language = data.language && data.language !== 'auto' ? data.language : detectLanguage(data.snippet);
    const userId = userIdFromCtx(context);
    return createSnippet({ title: data.title, content: data.snippet, language, isPublic: data.isPublic, ownerId: userId }, userId);
  });

export const updateBin = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateBinSchema)
  .handler(async ({ data, context }) => {
    const language = data.language && data.language !== 'auto' ? data.language : detectLanguage(data.content);
    const userId = userIdFromCtx(context);
    const bin = await updateOwnedSnippet(
      { id: data.id, ownerId: userId, title: data.title, content: data.content, language, isPublic: data.isPublic },
      userId,
    );
    if (!bin) throw new Error('Bin not found');
    return bin;
  });

export const deleteBin = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(binIdSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const bin = await deleteOwnedSnippet({ id: data.id, ownerId: userId }, userId);
    if (!bin) throw new Error('Bin not found');
    return bin;
  });
