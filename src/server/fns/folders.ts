import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { createFolderSchema, updateFolderSchema } from '@/schemas/folder-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const listFolders = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    return prisma.folder.findMany({
      where: { ownerId: userIdFromCtx(context), isDeleted: false },
      include: { _count: { select: { files: { where: { isDeleted: false } } } } },
      orderBy: { createdAt: 'desc' },
    });
  });

export const createFolder = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createFolderSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    return prisma.folder.create({
      data: {
        name: data.name,
        color: data.color,
        ownerId: userIdFromCtx(context),
      },
      include: { _count: { select: { files: { where: { isDeleted: false } } } } },
    });
  });

export const updateFolder = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateFolderSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const folder = await prisma.folder.findUnique({ where: { id: data.id, ownerId: userId } });
    if (!folder) throw new Error('Folder not found or unauthorized');

    return prisma.folder.update({
      where: { id: data.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.color !== undefined && { color: data.color }),
      },
      include: { _count: { select: { files: { where: { isDeleted: false } } } } },
    });
  });

const folderIdSchema = z.object({ id: z.string().min(1) });

export const deleteFolder = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(folderIdSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const folder = await prisma.folder.findUnique({
      where: { id: data.id, ownerId: userId },
      include: { _count: { select: { files: { where: { isDeleted: false } } } } },
    });
    if (!folder) throw new Error('Folder not found or unauthorized');

    if (folder._count.files > 0) {
      await prisma.file.updateMany({
        where: { folderId: data.id, ownerId: userId },
        data: { folderId: null },
      });
    }
    await prisma.folder.delete({ where: { id: data.id } });
    return { id: data.id, filesCount: folder._count.files };
  });
