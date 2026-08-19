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
    const { getUserPreferences } = await import('@/db/queries/auth');
    const preferences = await getUserPreferences(userIdFromCtx(context));
    if (!preferences) throw new Error('User not found');
    return preferences;
  });

export const updateUserProfile = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateProfileSchema)
  .handler(async ({ data, context }) => {
    const { updateUserProfile: writeProfile } = await import('@/db/queries/auth');
    const userId = userIdFromCtx(context);
    return writeProfile(
      userId,
      {
        receiveEmail: data.receiveEmails,
        isProfilePublic: data.isProfilePublic,
        bio: data.bio,
        description: data.description,
        showAllFilesIncludesFoldered: data.showAllFilesIncludesFoldered,
      },
      userId,
    );
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
    const { getTokenById } = await import('@/db/queries/auth');
    const { getPublicOrigin } = await import('@/libs/request-origin');
    const tokenRecord = await getTokenById(data.keyId);
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
    const { listUserTokens } = await import('@/db/queries/auth');
    return listUserTokens(userIdFromCtx(context));
  });

export const createUserToken = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createTokenSchema)
  .handler(async ({ data, context }) => {
    const { createUserToken: writeToken } = await import('@/db/queries/auth');
    const { generateToken } = await import('@/libs/token');
    const userId = userIdFromCtx(context);
    return writeToken({ name: data.name, key: generateToken(), userId }, userId);
  });

const tokenIdSchema = z.object({ id: z.string().min(1) });

export const deleteUserToken = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(tokenIdSchema)
  .handler(async ({ data, context }) => {
    const { deleteOwnedToken } = await import('@/db/queries/auth');
    const userId = userIdFromCtx(context);
    const deleted = await deleteOwnedToken({ id: data.id, userId }, userId);
    if (!deleted) throw new Error('Token not found');
    return { success: true };
  });

export const updateTokenSettings = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateTokenSettingsSchema)
  .handler(async ({ data, context }) => {
    const [{ updateOwnedTokenSettings }, { getOwnedFlow }] = await Promise.all([import('@/db/queries/auth'), import('@/db/queries/flows')]);
    const userId = userIdFromCtx(context);

    if (data.flowId) {
      const flow = await getOwnedFlow(data.flowId, userId);
      if (!flow?.isActive) throw new Error('Flow not found');
    }

    const updated = await updateOwnedTokenSettings(
      {
        id: data.tokenId,
        userId,
        settings: {
          compressImage: data.compressImage,
          convertToJpeg: data.convertToJpeg,
          jpegQuality: data.jpegQuality,
          folderId: data.folderId,
          stripMetadata: data.stripMetadata,
          flowId: data.flowId,
        },
      },
      userId,
    );
    if (!updated) throw new Error('Token not found');
    return { success: true };
  });
