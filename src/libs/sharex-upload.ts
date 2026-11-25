import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import sharp from 'sharp';
import { createUploadedFile, findOwnedActiveFolderId, releaseUploadedFile } from '@/db/queries/uploads';
import type { token } from '@/db/schema/auth';
import type { JsonValue } from '@/db/schema/json';
import { env } from '@/libs/env';
import { dispatchFlowTrigger } from '@/libs/flows/run-flow';
import { inspectMetadata } from '@/libs/metadata-scrubber';
import { checkModerationGate, createModerationCase } from '@/libs/moderation/hash-gate';
import { getCdnUrl } from '@/libs/runtime-config';
import { s3Client } from '@/libs/S3Helper';
import { StorageQuotaExceededError, storageQuotaExceededPayload } from '@/libs/storage-quota';
import { resolveUploadContentType } from '@/libs/upload-content-type';

/** The Token options that shape a ShareX upload. */
export type SharexUploadSettings = Pick<
  typeof token.$inferSelect,
  'compressImage' | 'convertToJpeg' | 'jpegQuality' | 'folderId' | 'flowId'
>;

function toJpegFilename(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  const base = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  return `${base}.jpg`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function deleteUploadedObject(key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
  } catch {
    // Best-effort cleanup after a failed upload attempt.
  }
}

/**
 * Stores a ShareX upload for `userId` and answers as the ShareX route does.
 * Callers must have authenticated, rate limited and size checked the request.
 */
export async function storeSharexUpload(userId: string, settings: SharexUploadSettings, file: File): Promise<Response> {
  const nameParts = file.name.split('-');
  const tags = ['sharex-upload', nameParts[0]];

  let uploadBuffer: Uint8Array | Buffer = new Uint8Array(await file.arrayBuffer());
  let uploadFileName = file.name.toString().trim() || 'Untitled';
  let uploadContentType = resolveUploadContentType(file.type || 'application/octet-stream', uploadFileName, uploadBuffer);

  if (settings.compressImage && uploadContentType.startsWith('image/')) {
    try {
      if (settings.convertToJpeg) {
        uploadBuffer = await sharp(uploadBuffer)
          .rotate()
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: settings.jpegQuality, mozjpeg: true })
          .toBuffer();
        uploadContentType = 'image/jpeg';
        uploadFileName = toJpegFilename(uploadFileName);
      } else {
        const meta = await sharp(uploadBuffer).metadata();
        const fmt = meta.format?.toLowerCase();
        if (fmt === 'jpeg' || fmt === 'jpg') {
          uploadBuffer = await sharp(uploadBuffer).rotate().jpeg({ quality: settings.jpegQuality, mozjpeg: true }).toBuffer();
        } else if (fmt === 'png') {
          uploadBuffer = await sharp(uploadBuffer).png({ quality: settings.jpegQuality, compressionLevel: 9 }).toBuffer();
        } else if (fmt === 'webp') {
          uploadBuffer = await sharp(uploadBuffer).webp({ quality: settings.jpegQuality }).toBuffer();
        } else if (fmt === 'avif') {
          uploadBuffer = await sharp(uploadBuffer).avif({ quality: settings.jpegQuality }).toBuffer();
        }
      }
    } catch (processingError) {
      console.error('ShareX image processing failed, uploading original:', processingError);
    }
  }

  const scrubReport = await inspectMetadata(Buffer.from(uploadBuffer), uploadContentType);

  const moderationGate = await checkModerationGate(uploadBuffer, uploadContentType);

  let imageDimensions: { width: number; height: number } | null = null;
  if (uploadContentType.startsWith('image/')) {
    try {
      const { width, height } = await sharp(uploadBuffer).metadata();
      if (width && height) imageDimensions = { width, height };
    } catch (metadataError) {
      console.error('ShareX image dimension extraction failed:', metadataError);
    }
  }

  const fileName = `${Date.now()}-${uploadFileName.split(' ').join('_')}`;

  const folderId = settings.folderId ? await findOwnedActiveFolderId(settings.folderId, userId) : null;

  let dbResult: Awaited<ReturnType<typeof createUploadedFile>>;
  try {
    dbResult = await createUploadedFile(
      {
        ownerId: userId,
        size: uploadBuffer.byteLength,
        url: encodeURIComponent(fileName),
        title: uploadFileName,
        tags: tags.join(','),
        contentType: uploadContentType,
        folderId,
        privateUpload: !moderationGate.allowed,
        hashes: moderationGate.hashes,
        scrubReport: scrubReport as unknown as JsonValue,
        dimensions: imageDimensions,
      },
      userId,
    );
  } catch (error) {
    if (error instanceof StorageQuotaExceededError) {
      return json(storageQuotaExceededPayload(error), error.status);
    }
    throw error;
  }

  const key = `${userId}/${fileName}`;
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
      Body: uploadBuffer,
      ContentType: uploadContentType,
      ACL: moderationGate.allowed ? 'public-read' : 'private',
      CacheControl: 'max-age=31536000',
    },
  });
  try {
    await upload.done();
  } catch (error) {
    await Promise.all([releaseUploadedFile(dbResult.id, userId), deleteUploadedObject(key)]);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return json({ error: message, code: 'UPLOAD_FAILED' }, 500);
  }

  if (!moderationGate.allowed) {
    await createModerationCase({
      fileId: dbResult.id,
      gate: moderationGate,
      uploaderId: userId,
      uploadMetadata: { source: 'sharex', fileName: uploadFileName },
    });
    return json({ error: 'Upload rejected by moderation policy', code: 'MODERATION_REJECTED' }, 403);
  }

  void dispatchFlowTrigger(
    'upload',
    userId,
    [{ fileId: dbResult.id, title: dbResult.title, contentType: dbResult.contentType, tags: dbResult.tags }],
    settings.flowId,
  );

  return new Response(
    JSON.stringify({
      data: {
        link: `${getCdnUrl()}/${userId}/${dbResult.url}`,
        thumbnail: `${getCdnUrl()}/${userId}/${dbResult.url}`,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
