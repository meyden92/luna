import { randomUUID } from 'node:crypto';
import { CopyObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getOwnedOutput } from '@/db/queries/studio';
import { env } from '@/libs/env';
import { getPrivateSignedUrl, s3Client } from '@/libs/S3Helper';
import { UserFacingError } from '@/libs/user-facing-error';
import type { TemplatePreview } from '@/schemas/studio-schema';
import { outputExtension } from './outputs';

/**
 * A Template's preview images: private objects under `studio-templates/`,
 * owned by the Template and counted against no quota. Server-only.
 */

const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
const PREVIEW_URL_TTL_SECONDS = 3600;

const previewKey = (contentType: string, name: string) => `studio-templates/${randomUUID()}.${outputExtension(contentType, name)}`;

/**
 * Stores the previews the editor saved, in order, and returns their keys:
 * kept ones must be the Template's already, uploads must be images, and
 * Outputs must be the admin's own unexpired images (they are copied).
 * Returns the keys this call created too, so a failed save can remove them.
 */
export async function storeTemplatePreviews(
  previews: TemplatePreview[],
  { uploads, adminId, currentKeys }: { uploads: Map<string, File>; adminId: string; currentKeys: string[] },
): Promise<{ keys: string[]; created: string[] }> {
  const keys: string[] = [];
  const created: string[] = [];
  const bucket = env.AWS_BUCKET_NAME;
  try {
    for (const preview of previews) {
      if (preview.source === 'key') {
        if (!currentKeys.includes(preview.key)) throw new UserFacingError('A preview image is not this Template’s.');
        keys.push(preview.key);
        continue;
      }
      if (preview.source === 'upload') {
        const file = uploads.get(preview.key);
        if (!file?.type.startsWith('image/')) throw new UserFacingError('A preview must be an image.');
        if (file.size > MAX_PREVIEW_BYTES) throw new UserFacingError('A preview image may be at most 10 MB.');
        const key = previewKey(file.type, file.name);
        await new Upload({
          client: s3Client,
          params: { Bucket: bucket, Key: key, Body: new Uint8Array(await file.arrayBuffer()), ContentType: file.type, ACL: 'private' },
        }).done();
        created.push(key);
        keys.push(key);
        continue;
      }
      const owned = await getOwnedOutput(preview.outputId, adminId);
      if (!owned || owned.output.expiredAt) throw new UserFacingError('This Output no longer exists.');
      if (owned.output.mediaKind !== 'image') throw new UserFacingError('A preview must be an image.');
      const key = previewKey(owned.output.contentType, owned.output.s3Key);
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: key,
          CopySource: `${bucket}/${encodeURIComponent(owned.output.s3Key).replace(/%2F/g, '/')}`,
          ContentType: owned.output.contentType,
          ACL: 'private',
        }),
      );
      created.push(key);
      keys.push(key);
    }
  } catch (error) {
    await deleteTemplatePreviews(created);
    throw error;
  }
  return { keys, created };
}

/** Removes preview objects; a failure is logged, never thrown, because the Template write already happened. */
export async function deleteTemplatePreviews(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await s3Client
    .send(new DeleteObjectsCommand({ Bucket: env.AWS_BUCKET_NAME, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }))
    .catch((error) => console.error('[studio] Removing Template previews failed:', error));
}

/** The previews with URLs signed for the editor. */
export function signTemplatePreviews(keys: string[]): Promise<{ key: string; url: string }[]> {
  return Promise.all(keys.map(async (key) => ({ key, url: await getPrivateSignedUrl(key, PREVIEW_URL_TTL_SECONDS) })));
}
