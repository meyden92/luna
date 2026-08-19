import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createFolder as createFolderRow, deleteOwnedFolder, listOwnedFolders, updateOwnedFolder } from '@/db/queries/folders';
import { createFolderSchema, updateFolderSchema } from '@/schemas/folder-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const listFolders = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => listOwnedFolders(userIdFromCtx(context)));

export const createFolder = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createFolderSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    return createFolderRow({ name: data.name, color: data.color, ownerId: userId }, userId);
  });

export const updateFolder = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateFolderSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const folder = await updateOwnedFolder({ id: data.id, ownerId: userId, name: data.name, color: data.color }, userId);
    if (!folder) throw new Error('Folder not found or unauthorized');
    return folder;
  });

const folderIdSchema = z.object({ id: z.string().min(1) });

export const deleteFolder = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(folderIdSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const result = await deleteOwnedFolder({ id: data.id, ownerId: userId }, userId);
    if (!result) throw new Error('Folder not found or unauthorized');
    return result;
  });
