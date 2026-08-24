import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { avatarTooLargeMessage } from '@/schemas/credentials-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

/**
 * Self-service Avatar management (issue #54).
 *
 * Username, display name and password changes are not here: Better-Auth's own
 * client endpoints already do those, and re-wrapping them would only add a
 * second place for the rules to drift. An Avatar needs `sharp` and the bucket,
 * so it has to be a server function.
 */

const avatarSchema = z.object({
  /** The raw image, base64-encoded — server functions carry JSON, not multipart. */
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

    // Base64 inflates by 4/3, so the ceiling is checked on the decoded bytes —
    // and before `normalizeAvatar` ever sees them, same as the raw path.
    const bytes = Buffer.from(data.image, 'base64');
    if (bytes.byteLength > AVATAR_MAX_UPLOAD_BYTES) {
      throw new AvatarRejectedError(avatarTooLargeMessage());
    }

    const previous = (await getSettingsProfile(userId))?.image;
    const key = await uploadAvatar(await normalizeAvatar(bytes));

    await updateUserProfile(userId, { image: key }, userId);
    // Only after the new Avatar is stored and recorded, so a failed delete can
    // never leave a User pointing at an object that is gone.
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
