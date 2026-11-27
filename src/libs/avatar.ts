import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

import { avatarTooLargeMessage } from '@/schemas/credentials-schema';
import { getS3 } from './S3Helper';
import { matchesStoragePath, renderStoragePath } from './storage-paths';
import { UserFacingError } from './user-facing-error';

/**
 * An Avatar is a plain bucket object, never a `file` row: it stays out of the
 * file manager and off the owner's storage quota.
 */

export const AVATAR_SIZE = 512;
/** Rejected input the User can fix by choosing a different file. */
export class AvatarRejectedError extends UserFacingError {
  constructor(message: string) {
    super(message, 'AvatarRejectedError');
  }
}

/**
 * Re-encodes to a square WebP, which also discards EXIF, GPS included. Input
 * above `maxUploadMib` is refused before decoding, so a decompression bomb is
 * never expanded.
 */
export async function normalizeAvatar(input: Buffer, maxUploadMib: number): Promise<Buffer> {
  if (input.byteLength > maxUploadMib * 1024 * 1024) {
    throw new AvatarRejectedError(avatarTooLargeMessage(maxUploadMib));
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

/** Stores a normalised Avatar under the Avatar path template and returns the CDN key to save on the User. */
export async function uploadAvatar(normalized: Buffer, pathTemplate: string): Promise<string> {
  const key = renderStoragePath<'avatarPath'>(pathTemplate, { uuid: randomUUID().replaceAll('-', '') });

  const { bucket, client } = getS3();

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
 * not fail because the old one could not be cleaned up. A User can write their
 * own `image`, so anything not shaped like the Avatar path template is left
 * alone, Avatars stored under an earlier template included.
 */
export async function deleteAvatar(previous: string | null | undefined, pathTemplate: string): Promise<void> {
  if (!previous) return;

  const key = previous.startsWith('http') ? new URL(previous).pathname.replace(/^\//, '') : previous.replace(/^\//, '');
  if (!matchesStoragePath(pathTemplate, key)) return;

  try {
    const { bucket, client } = getS3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.error(`[Avatar] Failed to delete replaced avatar ${key}:`, error);
  }
}
