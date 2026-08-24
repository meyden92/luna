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
      { AvatarRejectedError, deleteAvatar, normalizeAvatar, uploadAvatar, AVATAR_MAX_UPLOAD_BYTES },
      { getSettingsProfile, updateUserProfile },
    ] = await Promise.all([import('@/libs/avatar'), import('@/db/queries/auth')]);

    const userId = userIdFromCtx(context);

    // Base64 inflates by 4/3, so the ceiling applies to the decoded bytes.
    const bytes = Buffer.from(data.image, 'base64');
    if (bytes.byteLength > AVATAR_MAX_UPLOAD_BYTES) {
      throw new AvatarRejectedError(avatarTooLargeMessage());
    }

    const previous = (await getSettingsProfile(userId))?.image;
    const key = await uploadAvatar(await normalizeAvatar(bytes));

    await updateUserProfile(userId, { image: key }, userId);
    // Last, so a failed delete cannot leave a User pointing at a gone object.
    await deleteAvatar(previous);

    return { image: key };
  });

export const removeAvatar = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const [{ deleteAvatar }, { getSettingsProfile, updateUserProfile }] = await Promise.all([
      import('@/libs/avatar'),
      import('@/db/queries/auth'),
    ]);

    const userId = userIdFromCtx(context);
    const previous = (await getSettingsProfile(userId))?.image;

    await updateUserProfile(userId, { image: null }, userId);
    await deleteAvatar(previous);

    return { image: null };
  });
