import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Prisma } from '@db/client';
import { createFileRoute } from '@tanstack/react-router';
import { checkScopedRateLimit, retryAfterSeconds } from '@/libs/api/rate-limit';
import { writeCreateAuditLog } from '@/libs/audit/transaction-audit';
import { env } from '@/libs/env';
import { dispatchFlowTrigger } from '@/libs/flows/run-flow';
import { type MetadataScrubReport, scrubMetadataIfNeeded } from '@/libs/metadata-scrubber';
import { checkModerationGate, createModerationCase, type FileHashes } from '@/libs/moderation/hash-gate';
import prisma from '@/libs/prismadb';
import { requireAuthenticatedUser } from '@/libs/rbac/guards';
import { s3Client } from '@/libs/S3Helper';
import { ensureStorageQuotaAvailableViaPrisma, StorageQuotaExceededError, storageQuotaExceededPayload } from '@/libs/storage-quota';

const MAX_WEB_UPLOAD_BYTES = 200 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isAllowedUploadContentType(contentType: string): boolean {
  return (
    contentType.startsWith('image/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('text/') ||
    contentType.startsWith('application/vnd.') ||
    [
      'application/gzip',
      'application/json',
      'application/octet-stream',
      'application/pdf',
      'application/x-7z-compressed',
      'application/x-rar-compressed',
      'application/x-tar',
      'application/x-zip-compressed',
      'application/xml',
      'application/zip',
    ].includes(contentType)
  );
}

function normalizeUploadContentType(contentType: string | null | undefined): string {
  const normalized = contentType?.trim().toLowerCase();
  return normalized || 'application/octet-stream';
}

function sanitizeUploadFilename(filename: string): string {
  return filename.trim().replace(/[\\/]/g, '_') || 'upload';
}

function parsePositiveInteger(value: FormDataEntryValue | null): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

async function deleteUploadedObject(key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
  } catch {
    // Best-effort cleanup. The upload error should remain the surfaced failure.
  }
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

async function reserveFileRecord({
  userId,
  size,
  fileName,
  storedFileName,
  contentType,
  width,
  height,
  privateUpload,
  hashes,
  scrubReport,
}: {
  userId: string;
  size: number;
  fileName: string;
  storedFileName: string;
  contentType: string;
  width?: number;
  height?: number;
  privateUpload: boolean;
  hashes: FileHashes;
  scrubReport: MetadataScrubReport;
}) {
  return prisma.$transaction(async (tx) => {
    await ensureStorageQuotaAvailableViaPrisma(tx, userId, size);

    const createdFile = await tx.file.create({
      data: {
        ownerId: userId,
        size,
        url: encodeURIComponent(storedFileName),
        private: privateUpload,
        tags: 'web-upload',
        title: fileName,
        contentType,
        sha256: hashes.sha256,
        md5: hashes.md5,
        phash: hashes.phash,
        scrubReport: scrubReport as unknown as Prisma.InputJsonValue,
        moderationStatus: privateUpload ? 'quarantined' : 'clear',
        ...(width && height ? { metadata: { create: { width, height } } } : {}),
      },
      include: { metadata: true },
    });
    const { metadata: _metadata, ...auditFile } = createdFile;
    await writeCreateAuditLog(tx, { model: 'File', record: auditFile, userId });

    return createdFile;
  });
}

async function handle(request: Request): Promise<Response> {
  let userId: string;
  try {
    const user = await requireAuthenticatedUser(request.headers);
    userId = user.id;
  } catch {
    return json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, 401);
  }

  const rl = checkScopedRateLimit('uploadWeb', userId);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': retryAfterSeconds(rl.retryAfterMs) },
    });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_WEB_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return json({ error: 'File too large', code: 'PAYLOAD_TOO_LARGE' }, 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Invalid form data', code: 'VALIDATION_FAILED' }, 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return json({ error: 'Missing file', code: 'VALIDATION_FAILED' }, 400);
  }

  const fileName = sanitizeUploadFilename(formData.get('filename')?.toString() || file.name);
  const contentType = normalizeUploadContentType(file.type);
  if (file.size <= 0) {
    return json({ error: 'File is empty', code: 'VALIDATION_FAILED' }, 400);
  }
  if (file.size > MAX_WEB_UPLOAD_BYTES) {
    return json({ error: 'File too large', code: 'PAYLOAD_TOO_LARGE' }, 413);
  }
  if (!isAllowedUploadContentType(contentType)) {
    return json({ error: `Unsupported file type: ${contentType}`, code: 'UNSUPPORTED_FILE_TYPE' }, 415);
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const shouldStripMetadata = formData.get('stripMetadata')?.toString() === 'true';
  const scrubbed = await scrubMetadataIfNeeded(rawBuffer, contentType, shouldStripMetadata);
  const uploadBuffer = scrubbed.buffer;
  const moderationGate = await checkModerationGate(uploadBuffer, contentType);
  const storedFileName = `${randomUUID()}-${fileName}`;
  const key = `${userId}/${storedFileName}`;
  const width = parsePositiveInteger(formData.get('width'));
  const height = parsePositiveInteger(formData.get('height'));

  let dbResult: Awaited<ReturnType<typeof reserveFileRecord>>;
  try {
    dbResult = await reserveFileRecord({
      userId,
      size: uploadBuffer.byteLength,
      fileName,
      storedFileName,
      contentType,
      width,
      height,
      privateUpload: !moderationGate.allowed,
      hashes: moderationGate.hashes,
      scrubReport: scrubbed.report,
    });
  } catch (error) {
    if (error instanceof StorageQuotaExceededError) {
      return json(storageQuotaExceededPayload(error), error.status);
    }
    throw error;
  }

  try {
    await new Upload({
      client: s3Client,
      params: {
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
        Body: uploadBuffer,
        ContentType: contentType,
        ACL: moderationGate.allowed ? 'public-read' : 'private',
        CacheControl: 'max-age=31536000',
      },
    }).done();
  } catch (error) {
    await Promise.all([releaseReservedFile(dbResult.id), deleteUploadedObject(key)]);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return json({ error: message, code: 'UPLOAD_FAILED' }, 500);
  }

  if (!moderationGate.allowed) {
    await createModerationCase({
      fileId: dbResult.id,
      gate: moderationGate,
      uploaderId: userId,
      uploadMetadata: { source: 'web', fileName },
    });
    return json({ error: 'Upload rejected by moderation policy', code: 'MODERATION_REJECTED' }, 403);
  }

  void dispatchFlowTrigger('upload', userId, [
    { fileId: dbResult.id, title: dbResult.title, contentType: dbResult.contentType, tags: dbResult.tags },
  ]);

  return json({
    success: true,
    file: {
      id: dbResult.id,
      title: dbResult.title,
      createdAt: dbResult.createdAt,
      ownerId: dbResult.ownerId,
      folderId: dbResult.folderId,
      tags: dbResult.tags,
      url: dbResult.url,
      private: dbResult.private,
      isDeleted: dbResult.isDeleted,
      size: dbResult.size,
      contentType: dbResult.contentType,
      metadata: dbResult.metadata ? { width: dbResult.metadata.width, height: dbResult.metadata.height, duration: null } : null,
      folder: null,
    },
  });
}

export const Route = createFileRoute('/api/upload/web')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
