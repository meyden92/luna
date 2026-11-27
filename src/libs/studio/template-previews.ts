import { randomUUID } from 'node:crypto';
import { CopyObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getOwnedOutput } from '@/db/queries/generations';
import { getPlatformSettings } from '@/db/queries/platform-settings';
import { getStudioSettings } from '@/db/queries/studio';
import { env } from '@/libs/env';
import { getPrivateSignedUrl, s3Client } from '@/libs/S3Helper';
import { renderStoragePath } from '@/libs/storage-paths';
import { UserFacingError } from '@/libs/user-facing-error';
import type { TemplatePreview } from '@/schemas/studio-schema';
import { mediaKindOf, outputExtension } from './outputs';
import { templateReferenceKeys } from './template-config';
import type { FieldConfig, FileRef } from './types';
import { referencesOf } from './variables';

/**
 * A Template's preview and reference images: private objects under the
 * configured Template paths, owned by the Template and counted against no
 * quota. Server-only.
 */

const PREVIEW_URL_TTL_SECONDS = 3600;
const MIB = 1024 * 1024;

/** Renders a Template preview or reference path; both take the same variables. */
const objectKey = (template: string, contentType: string, name: string) =>
  renderStoragePath<'templatePreviewPath'>(template, { uuid: randomUUID(), ext: outputExtension(contentType, name) });

async function putObject(file: File, template: string): Promise<string> {
  const key = objectKey(template, file.type, file.name);
  await new Upload({
    client: s3Client,
    params: {
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
      Body: new Uint8Array(await file.arrayBuffer()),
      ContentType: file.type,
      ACL: 'private',
    },
  }).done();
  return key;
}

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
  const [{ templatePreviewPath }, { templatePreviewMaxMib }] = await Promise.all([getPlatformSettings(), getStudioSettings()]);
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
        if (file.size > templatePreviewMaxMib * MIB)
          throw new UserFacingError(`A preview image may be at most ${templatePreviewMaxMib} MB.`);
        const key = await putObject(file, templatePreviewPath);
        created.push(key);
        keys.push(key);
        continue;
      }
      const owned = await getOwnedOutput(preview.outputId, adminId);
      if (!owned || owned.output.expiredAt) throw new UserFacingError('This Output no longer exists.');
      if (owned.output.mediaKind !== 'image') throw new UserFacingError('A preview must be an image.');
      const key = objectKey(templatePreviewPath, owned.output.contentType, owned.output.s3Key);
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

/**
 * Stores the reference images the editor saved and returns the Fields with
 * each upload swapped for its stored `template` ref: kept ones must be the
 * Template's already, uploads must be images.
 * Returns the keys this call created too, so a failed save can remove them.
 */
export async function storeTemplateReferences(
  fields: FieldConfig[],
  { uploads, currentKeys }: { uploads: Map<string, File>; currentKeys: string[] },
): Promise<{ fields: FieldConfig[]; created: string[] }> {
  const created: string[] = [];
  const [{ templateReferencePath }, { templateReferenceMaxMib }] = await Promise.all([getPlatformSettings(), getStudioSettings()]);
  const store = async (field: FieldConfig, ref: FileRef): Promise<FileRef> => {
    if (ref.source === 'template') {
      if (!currentKeys.includes(ref.key)) throw new UserFacingError('A reference image is not this Template’s.');
      return ref;
    }
    const file = ref.source === 'upload' ? uploads.get(ref.key) : undefined;
    if (!file) throw new UserFacingError(`A reference image of ${field.name} is missing.`);
    if (mediaKindOf(file.type) !== 'image') throw new UserFacingError('A reference image must be an image.');
    if (file.size > templateReferenceMaxMib * MIB) {
      throw new UserFacingError(`A reference image may be at most ${templateReferenceMaxMib} MB.`);
    }
    const key = await putObject(file, templateReferencePath);
    created.push(key);
    return { source: 'template', key };
  };
  try {
    const stored: FieldConfig[] = [];
    for (const field of fields) {
      const refs: FileRef[] = [];
      for (const ref of referencesOf(field)) refs.push(await store(field, ref));
      stored.push(refs.length === 0 ? field : { ...field, value: Array.isArray(field.value) ? refs : (refs[0] as FileRef) });
    }
    return { fields: stored, created };
  } catch (error) {
    await deleteTemplatePreviews(created);
    throw error;
  }
}

/** The reference images of a Template's Fields with URLs signed for the editor. */
export function signTemplateReferences(fields: FieldConfig[]): Promise<{ key: string; url: string }[]> {
  return signTemplatePreviews(templateReferenceKeys(fields));
}

/** Removes preview and reference objects; a failure is logged, never thrown, because the Template write already happened. */
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
