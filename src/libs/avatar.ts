import { randomBytes } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

import { AVATAR_MAX_UPLOAD_BYTES, avatarTooLargeMessage } from '@/schemas/credentials-schema';
import { env } from './env';
import { s3Client } from './S3Helper';
import { UserFacingError } from './user-facing-error';

/**
 * Avatars (issue #54). An Avatar is a plain object in the bucket under a static
 * prefix, never a `file` row: it stays out of the file manager and off the
 * owner's storage quota. This mirrors how template preview images are handled
 * in `template-upload.ts` — random name, long cache header, best-effort delete
 * of the object it replaces.
 *
 * Every Avatar gets a fresh random name, so replacing one is visible
 * immediately and no cache ever has to be invalidated.
 */

export const AVATAR_SIZE = 512;
/** Refused before decoding, so a decompression bomb is never expanded. */
export { AVATAR_MAX_UPLOAD_BYTES };

const AVATAR_PREFIX = 'static/avatar';

/** Rejected input the User can fix by choosing a different file. */
export class AvatarRejectedError extends UserFacingError {
  constructor(message: string) {
    super(message, 'AvatarRejectedError');
  }
}

/**
 * Re-encodes an uploaded image into the one shape every Avatar has: a square
 * WebP of `AVATAR_SIZE`. Re-encoding is also what discards EXIF — including the
 * GPS coordinates a phone photograph carries — so nothing but pixels reaches
 * the CDN.
 */
export async function normalizeAvatar(input: Buffer): Promise<Buffer> {
  if (input.byteLength > AVATAR_MAX_UPLOAD_BYTES) {
    throw new AvatarRejectedError(avatarTooLargeMessage());
  }

  try {
    // `sharp` keeps no metadata unless asked, so the EXIF drop needs no step of
    // its own. `cover` centres a non-square photo rather than distorting it.
    return await sharp(input).resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' }).webp({ quality: 82 }).toBuffer();
  } catch {
    // sharp refuses anything it cannot decode, which is the content sniff —
    // the browser-supplied MIME type is never trusted.
    throw new AvatarRejectedError('That file is not an image we can read');
  }
}

/** Stores a normalised Avatar and returns the CDN key to save on the User. */
export async function uploadAvatar(normalized: Buffer): Promise<string> {
  const key = `${AVATAR_PREFIX}/${randomBytes(16).toString('hex')}.webp`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
      Body: normalized,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return key;
}

/**
 * Removes the object an Avatar replaced. Best-effort by design: a User whose
 * new Avatar is already stored must not see an error because the old one could
 * not be cleaned up. Only objects under the Avatar prefix are touched, so a
 * stale Discord CDN URL left on a User is ignored rather than parsed.
 */
export async function deleteAvatar(previous: string | null | undefined): Promise<void> {
  if (!previous) return;

  const key = previous.startsWith('http') ? new URL(previous).pathname.replace(/^\//, '') : previous.replace(/^\//, '');
  if (!key.startsWith(`${AVATAR_PREFIX}/`)) return;

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
  } catch (error) {
    console.error(`[Avatar] Failed to delete replaced avatar ${key}:`, error);
  }
}
