import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { avatarTooLargeMessage } from '@/schemas/credentials-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

/**
 * Self-service Avatar management. Username, display name and password changes
 * have no server function: Better-Auth's client endpoints own those rules, and
 * wrapping them would give the rules a second place to drift.
 */

const avatarSchema = z.object({
  /** Base64-encoded: server functions carry JSON, not multipart. */
  image: z.string().min(1),
});

export const updateAvatar = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(avatarSchema)
  .handler(async ({ data, context }) => {
    const [
      { AvatarRejectedError, deleteAvatar, normalizeAvatar, uploadAvatar },
      { getSettingsProfile, updateUserProfile },
      { getPlatformSettings },
    ] = await Promise.all([import('@/libs/avatar'), import('@/db/queries/auth'), import('@/db/queries/platform-settings')]);

    const userId = userIdFromCtx(context);
    const { avatarMaxUploadMib, avatarPath } = await getPlatformSettings();

    // Base64 inflates by 4/3, so the ceiling applies to the decoded bytes.
    const bytes = Buffer.from(data.image, 'base64');
    if (bytes.byteLength > avatarMaxUploadMib * 1024 * 1024) {
      throw new AvatarRejectedError(avatarTooLargeMessage(avatarMaxUploadMib));
    }

    const previous = (await getSettingsProfile(userId))?.image;
    const key = await uploadAvatar(await normalizeAvatar(bytes, avatarMaxUploadMib), avatarPath);

    await updateUserProfile(userId, { image: key }, userId);
    // Last, so a failed delete cannot leave a User pointing at a gone object.
    await deleteAvatar(previous, avatarPath);

    return { image: key };
  });

export const removeAvatar = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const [{ deleteAvatar }, { getSettingsProfile, updateUserProfile }, { getPlatformSettings }] = await Promise.all([
      import('@/libs/avatar'),
      import('@/db/queries/auth'),
      import('@/db/queries/platform-settings'),
    ]);

    const userId = userIdFromCtx(context);
    const previous = (await getSettingsProfile(userId))?.image;

    await updateUserProfile(userId, { image: null }, userId);
    await deleteAvatar(previous, (await getPlatformSettings()).avatarPath);

    return { image: null };
  });
