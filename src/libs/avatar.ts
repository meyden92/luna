import { randomBytes } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

import { AVATAR_MAX_UPLOAD_BYTES, avatarTooLargeMessage } from '@/schemas/credentials-schema';
import { UserFacingError } from './user-facing-error';

/**
 * An Avatar is a plain bucket object, never a `file` row: it stays out of the
 * file manager and off the owner's storage quota.
 */

/**
 * The bucket and its client are reached through this rather than imported,
 * because importing them validates the whole environment at module load — which
 * `normalizeAvatar`, a pure bytes-to-bytes function, has no need of and which
 * would make its tests require a full set of secrets.
 */
async function storage() {
  const [{ env }, { s3Client }] = await Promise.all([import('./env'), import('./S3Helper')]);
  return { bucket: env.AWS_BUCKET_NAME, client: s3Client };
}

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

/** Re-encodes to a square WebP, which also discards EXIF, GPS included. */
export async function normalizeAvatar(input: Buffer): Promise<Buffer> {
  if (input.byteLength > AVATAR_MAX_UPLOAD_BYTES) {
    throw new AvatarRejectedError(avatarTooLargeMessage());
  }

  try {
    // `cover` centres a non-square photo rather than distorting it.
    return await sharp(input).resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' }).webp({ quality: 82 }).toBuffer();
  } catch {
    // Failure to decode is the content sniff; the browser-supplied MIME type is
    // never trusted.
    throw new AvatarRejectedError('That file is not an image we can read');
  }
}

/** Stores a normalised Avatar and returns the CDN key to save on the User. */
export async function uploadAvatar(normalized: Buffer): Promise<string> {
  const key = `${AVATAR_PREFIX}/${randomBytes(16).toString('hex')}.webp`;

  const { bucket, client } = await storage();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: normalized,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  } catch (error) {
    // The SDK's own failures read as deserialization internals, which say
    // nothing to whoever picked the picture. Keep the detail where it is useful.
    console.error(`[Avatar] Failed to store ${key}:`, error);
    throw new Error('Could not store your avatar. Try again in a moment.');
  }

  return key;
}

/**
 * Removes the object an Avatar replaced, best-effort: a stored new Avatar must
 * not fail because the old one could not be cleaned up. Anything outside the
 * Avatar prefix is left alone.
 */
export async function deleteAvatar(previous: string | null | undefined): Promise<void> {
  if (!previous) return;

  const key = previous.startsWith('http') ? new URL(previous).pathname.replace(/^\//, '') : previous.replace(/^\//, '');
  if (!key.startsWith(`${AVATAR_PREFIX}/`)) return;

  try {
    const { bucket, client } = await storage();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.error(`[Avatar] Failed to delete replaced avatar ${key}:`, error);
  }
}
