import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { updateLocaleSchema } from '@/schemas/locale-schema';
import { updateProfileSchema } from '@/schemas/profile-schema';
import { createTokenSchema, updateTokenSettingsSchema } from '@/schemas/token-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const SHAREX_UPLOAD_PATH = '/api/upload/sharex';

export const getUserSettings = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const userId = userIdFromCtx(context);
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { showAllFilesIncludesFoldered: true },
    });
    if (!dbUser) throw new Error('User not found');
    return dbUser;
  });

export const updateUserProfile = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateProfileSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    return prisma.user.update({
      where: { id: userIdFromCtx(context) },
      data: {
        receiveEmail: data.receiveEmails,
        isProfilePublic: data.isProfilePublic,
        bio: data.bio,
        description: data.description,
        showAllFilesIncludesFoldered: data.showAllFilesIncludesFoldered,
      },
    });
  });

const themeSchema = z.object({ theme: z.enum(['default', 'light', 'dark']) });

export const updateUserTheme = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'none' }))
  .validator(themeSchema)
  .handler(async ({ data }) => {
    const { setCookie } = await import('@tanstack/react-start/server');
    setCookie('theme', data.theme, {
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      path: '/',
    });
    return { message: 'Theme updated' };
  });

export const updateUserLocale = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateLocaleSchema)
  .handler(async ({ data }) => {
    const [{ env }, { setCookie }] = await Promise.all([import('@/libs/env'), import('@tanstack/react-start/server')]);
    setCookie('locale', data.locale, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return { success: true, locale: data.locale };
  });

const sharexConfigSchema = z.object({ keyId: z.string().min(1) });

export const getShareXConfig = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(sharexConfigSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const { getPublicOrigin } = await import('@/libs/request-origin');
    const tokenRecord = await prisma.token.findFirst({
      where: { id: data.keyId },
      select: { key: true, enabled: true, userId: true },
    });
    if (!tokenRecord) throw new Error('Token not found');
    if (!tokenRecord.enabled) throw new Error('Token is not enabled');
    if (tokenRecord.userId !== userIdFromCtx(context)) throw new Error('Unauthorized');

    return {
      DestinationType: 'ImageUploader, TextUploader, FileUploader',
      RequestURL: new URL(SHAREX_UPLOAD_PATH, getPublicOrigin()).toString(),
      Body: 'MultipartFormData',
      Arguments: {
        filename: '$filename$',
        text: '$input$',
        token: tokenRecord.key,
      },
      FileFormName: 'file',
      URL: '$json:data.link$',
      ThumbnailURL: '$json:data.thumbnail$',
    };
  });

export const listTokens = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    return prisma.token.findMany({
      where: { userId: userIdFromCtx(context) },
      orderBy: { createdAt: 'desc' },
    });
  });

export const createUserToken = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createTokenSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const { generateToken } = await import('@/libs/token');
    return prisma.token.create({
      data: {
        name: data.name,
        key: generateToken(),
        userId: userIdFromCtx(context),
      },
    });
  });

const tokenIdSchema = z.object({ id: z.string().min(1) });

export const deleteUserToken = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(tokenIdSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const existing = await prisma.token.findFirst({
      where: { id: data.id, userId: userIdFromCtx(context) },
      select: { id: true },
    });
    if (!existing) throw new Error('Token not found');
    await prisma.token.delete({ where: { id: existing.id } });
    return { success: true };
  });

export const updateTokenSettings = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateTokenSettingsSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const existing = await prisma.token.findFirst({
      where: { id: data.tokenId, userId: userIdFromCtx(context) },
      select: { id: true },
    });
    if (!existing) throw new Error('Token not found');
    if (data.flowId) {
      const flow = await prisma.flow.findFirst({
        where: { id: data.flowId, ownerId: userIdFromCtx(context), isActive: true },
        select: { id: true },
      });
      if (!flow) throw new Error('Flow not found');
    }
    await prisma.token.update({
      where: { id: existing.id },
      data: {
        compressImage: data.compressImage,
        convertToJpeg: data.convertToJpeg,
        jpegQuality: data.jpegQuality,
        folderId: data.folderId,
        stripMetadata: data.stripMetadata,
        flowId: data.flowId,
      },
    });
    return { success: true };
  });
