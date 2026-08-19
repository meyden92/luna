import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createServerFn } from '@tanstack/react-start';
import { createGeneratedFile, getOwnedImageFile } from '@/db/queries/ai';
import { env } from '@/libs/env';
import { fileS3Key, getPrivateSignedUrl, publicUploadAcl, s3Client } from '@/libs/S3Helper';
import { getCDNImage } from '@/libs/utils';
import { type BeautifierSourceFile, beautifierSourceFileQuerySchema, saveBeautifiedImageSchema } from '@/schemas/beautifier-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export type BeautifierSourceFileResult = { status: 'ok'; file: BeautifierSourceFile } | { status: 'not-found' } | { status: 'not-image' };

export const getBeautifierSourceFile = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(beautifierSourceFileQuerySchema)
  .handler(async ({ data, context }): Promise<BeautifierSourceFileResult> => {
    const userId = userIdFromCtx(context);
    const file = await getOwnedImageFile(data.fileId, userId);

    if (!file) return { status: 'not-found' };
    if (!file.contentType.startsWith('image/')) return { status: 'not-image' };

    const cdnUrl = file.private
      ? await getPrivateSignedUrl(fileS3Key(file.ownerId, file.url))
      : getCDNImage(`/${file.ownerId}/${file.url}`);

    return {
      status: 'ok',
      file: {
        id: file.id,
        title: file.title,
        contentType: file.contentType,
        size: file.size,
        createdAt: file.createdAt.toISOString(),
        cdnUrl,
        downloadUrl: `/api/download?id=${encodeURIComponent(file.id)}`,
        width: file.metadata?.width ?? null,
        height: file.metadata?.height ?? null,
        private: file.private,
      },
    };
  });

function beautifiedFilename(sourceFileId: string): string {
  return `beautified-${sourceFileId.slice(0, 8)}-${Date.now()}.png`;
}

async function deleteUploadedObject(key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
  } catch (error) {
    console.error('Failed to delete beautifier upload after database error', error);
  }
}

export const saveBeautifiedImage = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(saveBeautifiedImageSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const source = await getOwnedImageFile(data.sourceFileId, userId);

    if (!source) throw new Error('Source file not found');
    if (!source.contentType.startsWith('image/')) throw new Error('Source file is not an image');

    const base64 = data.imageDataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const filename = beautifiedFilename(source.id);
    const key = `${userId}/${filename}`;

    await new Upload({
      client: s3Client,
      params: {
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
        ACL: publicUploadAcl(source.private),
        CacheControl: 'max-age=31536000',
      },
    }).done();

    try {
      // Quota admission and the insert it guards stay in one transaction, opened
      // only after the upload so nothing waits on S3 while holding a row lock.
      const createdFile = await createGeneratedFile(
        {
          ownerId: userId,
          folderId: source.folderId,
          size: buffer.byteLength,
          url: encodeURIComponent(filename),
          private: source.private,
          tags: 'beautified',
          title: data.title ?? `${source.title || 'Image'} beautified.png`,
          contentType: 'image/png',
          dimensions: { width: data.config.width, height: data.config.height, description: `Beautified from ${source.id}` },
        },
        userId,
      );

      return {
        file: {
          id: createdFile.id,
          url: getCDNImage(`/${userId}/${createdFile.url}`),
          title: createdFile.title,
        },
      };
    } catch (error) {
      await deleteUploadedObject(key);
      throw error;
    }
  });
