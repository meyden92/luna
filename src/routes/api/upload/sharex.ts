import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Prisma } from '@db/client';
import { createFileRoute } from '@tanstack/react-router';
import sharp from 'sharp';
import { checkScopedRateLimit, retryAfterSeconds } from '@/libs/api/rate-limit';
import { writeCreateAuditLog } from '@/libs/audit/transaction-audit';
import { validateTokenKey } from '@/libs/auth/token-auth';
import { env } from '@/libs/env';
import { dispatchFlowTrigger } from '@/libs/flows/run-flow';
import { type MetadataScrubReport, scrubMetadataIfNeeded } from '@/libs/metadata-scrubber';
import { checkModerationGate, createModerationCase, type FileHashes } from '@/libs/moderation/hash-gate';
import prisma from '@/libs/prismadb';
import { UnauthorizedError } from '@/libs/rbac/guards';
import { s3Client } from '@/libs/S3Helper';
import { ensureStorageQuotaAvailable, StorageQuotaExceededError, storageQuotaExceededPayload } from '@/libs/storage-quota';

const cdnUrl = import.meta.env.VITE_PUBLIC_CDN_URL;
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
let inFlightSharexUploads = 0;

function getMaxUploadBytes(): number {
  return env.MAX_SHAREX_UPLOAD_BYTES;
}

function tryAcquireUploadSlot(): boolean {
  if (inFlightSharexUploads >= env.SHAREX_UPLOAD_CONCURRENCY) {
    return false;
  }
  inFlightSharexUploads += 1;
  return true;
}

function releaseUploadSlot(): void {
  inFlightSharexUploads = Math.max(0, inFlightSharexUploads - 1);
}

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

async function authenticateTokenFromForm(formData: FormData, headers: Headers) {
  const authHeader = headers.get('authorization');
  let key: string | null = null;
  if (authHeader?.startsWith('Bearer ')) key = authHeader.slice(7);
  else key = formData.get('token')?.toString() || null;

  if (!key) throw new UnauthorizedError('Missing authentication token');

  const tokenRecord = await validateTokenKey(key);
  if (!tokenRecord) throw new UnauthorizedError('Invalid token');
  return { user: { id: tokenRecord.user.id, email: tokenRecord.user.email }, tokenRecord };
}

async function releaseReservedFile(id: string): Promise<void> {
  try {
    await prisma.file.delete({ where: { id } });
  } catch {
    await prisma.file
      .update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      })
      .catch(() => undefined);
  }
}

async function deleteUploadedObject(key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
  } catch {
    // Best-effort cleanup after a failed upload attempt.
  }
}

async function reserveFileRecord({
  userId,
  size,
  fileName,
  storedFileName,
  contentType,
  tags,
  folderId,
  imageDimensions,
  privateUpload,
  hashes,
  scrubReport,
}: {
  userId: string;
  size: number;
  fileName: string;
  storedFileName: string;
  contentType: string;
  tags: string;
  folderId: string | null;
  imageDimensions: { width: number; height: number } | null;
  privateUpload: boolean;
  hashes: FileHashes;
  scrubReport: MetadataScrubReport;
}) {
  return prisma.$transaction(async (tx) => {
    await ensureStorageQuotaAvailable(tx, userId, size);

    const createdFile = await tx.file.create({
      data: {
        ownerId: userId,
        size,
        url: encodeURIComponent(storedFileName),
        private: privateUpload,
        tags,
        title: fileName,
        contentType,
        folderId,
        sha256: hashes.sha256,
        md5: hashes.md5,
        phash: hashes.phash,
        scrubReport: scrubReport as unknown as Prisma.InputJsonValue,
        moderationStatus: privateUpload ? 'quarantined' : 'clear',
        ...(imageDimensions ? { metadata: { create: imageDimensions } } : {}),
      },
    });
    await writeCreateAuditLog(tx, { model: 'File', record: createdFile, userId });

    return createdFile;
  });
}

async function handle(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > getMaxUploadBytes() + MULTIPART_OVERHEAD_BYTES) {
    return json({ error: 'File too large', code: 'PAYLOAD_TOO_LARGE' }, 413);
  }

  if (!tryAcquireUploadSlot()) {
    return new Response(JSON.stringify({ error: 'Server busy', code: 'SERVER_BUSY' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '5' },
    });
  }

  try {
    return await handleWithUploadSlot(request);
  } finally {
    releaseUploadSlot();
  }
}

async function handleWithUploadSlot(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid form data', code: 'VALIDATION_FAILED' }, 400);
  }

  let auth: Awaited<ReturnType<typeof authenticateTokenFromForm>>;
  try {
    auth = await authenticateTokenFromForm(formData, request.headers);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return json({ error: err.message, code: 'UNAUTHORIZED' }, 401);
    }
    throw err;
  }

  const { user, tokenRecord } = auth;

  const rl = checkScopedRateLimit('uploadSharex', user.id);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfterSeconds(rl.retryAfterMs) },
    });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return json({ error: 'Missing required fields', code: 'VALIDATION_FAILED' }, 400);
  }
  if (file.size > getMaxUploadBytes()) {
    return json({ error: 'File too large', code: 'PAYLOAD_TOO_LARGE' }, 413);
  }

  const nameParts = file.name.split('-');
  const tags = ['sharex-upload', nameParts[0]];

  let uploadBuffer: Uint8Array | Buffer = new Uint8Array(await file.arrayBuffer());
  let uploadContentType = file.type || 'application/octet-stream';
  let uploadFileName = file.name.toString().trim() || 'Untitled';

  if (tokenRecord.compressImage && uploadContentType.startsWith('image/')) {
    try {
      if (tokenRecord.convertToJpeg) {
        uploadBuffer = await sharp(uploadBuffer)
          .rotate()
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: tokenRecord.jpegQuality, mozjpeg: true })
          .toBuffer();
        uploadContentType = 'image/jpeg';
        uploadFileName = toJpegFilename(uploadFileName);
      } else {
        const meta = await sharp(uploadBuffer).metadata();
        const fmt = meta.format?.toLowerCase();
        if (fmt === 'jpeg' || fmt === 'jpg') {
          uploadBuffer = await sharp(uploadBuffer).rotate().jpeg({ quality: tokenRecord.jpegQuality, mozjpeg: true }).toBuffer();
        } else if (fmt === 'png') {
          uploadBuffer = await sharp(uploadBuffer).png({ quality: tokenRecord.jpegQuality, compressionLevel: 9 }).toBuffer();
        } else if (fmt === 'webp') {
          uploadBuffer = await sharp(uploadBuffer).webp({ quality: tokenRecord.jpegQuality }).toBuffer();
        } else if (fmt === 'avif') {
          uploadBuffer = await sharp(uploadBuffer).avif({ quality: tokenRecord.jpegQuality }).toBuffer();
        }
      }
    } catch (processingError) {
      console.error('ShareX image processing failed, uploading original:', processingError);
    }
  }

  const scrubbed = await scrubMetadataIfNeeded(Buffer.from(uploadBuffer), uploadContentType, tokenRecord.stripMetadata);
  uploadBuffer = scrubbed.buffer;
  const scrubReport = scrubbed.report;

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

  let folderId: string | null = null;
  if (tokenRecord.folderId) {
    const targetFolder = await prisma.folder.findFirst({
      where: { id: tokenRecord.folderId, ownerId: user.id, isDeleted: false },
      select: { id: true },
    });
    folderId = targetFolder?.id ?? null;
  }

  let dbResult: Awaited<ReturnType<typeof reserveFileRecord>>;
  try {
    dbResult = await reserveFileRecord({
      userId: user.id,
      size: uploadBuffer.byteLength,
      fileName: uploadFileName,
      storedFileName: fileName,
      contentType: uploadContentType,
      tags: tags.join(','),
      folderId,
      imageDimensions,
      privateUpload: !moderationGate.allowed,
      hashes: moderationGate.hashes,
      scrubReport,
    });
  } catch (error) {
    if (error instanceof StorageQuotaExceededError) {
      return json(storageQuotaExceededPayload(error), error.status);
    }
    throw error;
  }

  const key = `${user.id}/${fileName}`;
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
    await Promise.all([releaseReservedFile(dbResult.id), deleteUploadedObject(key)]);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return json({ error: message, code: 'UPLOAD_FAILED' }, 500);
  }

  if (!moderationGate.allowed) {
    await createModerationCase({
      fileId: dbResult.id,
      gate: moderationGate,
      uploaderId: user.id,
      uploadMetadata: { source: 'sharex', fileName: uploadFileName },
    });
    return json({ error: 'Upload rejected by moderation policy', code: 'MODERATION_REJECTED' }, 403);
  }

  void dispatchFlowTrigger(
    'upload',
    user.id,
    [{ fileId: dbResult.id, title: dbResult.title, contentType: dbResult.contentType, tags: dbResult.tags }],
    tokenRecord.flowId,
  );

  return new Response(
    JSON.stringify({
      data: {
        link: `${cdnUrl}/${user.id}/${dbResult.url}`,
        thumbnail: `${cdnUrl}/${user.id}/${dbResult.url}`,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

export const Route = createFileRoute('/api/upload/sharex')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
