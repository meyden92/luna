import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Prisma } from '@db/client';
import sharp from 'sharp';
import { z } from 'zod';
import { deriveSigningKey } from '@/libs/crypto/signing-keys';
import { env } from '@/libs/env';
import prisma from '@/libs/prismadb';
import { fileS3Key, s3Client } from '@/libs/S3Helper';

const formatSchema = z.enum(['avif', 'webp', 'jpeg', 'png']);
const fitSchema = z.enum(['cover', 'contain', 'inside', 'fill', 'outside']);
const PRIVATE_RENDITION_TTL_MS = 15 * 60_000;

export const renditionParamsSchema = z.object({
  w: z.coerce.number().int().min(16).max(4096).optional(),
  h: z.coerce.number().int().min(16).max(4096).optional(),
  fit: fitSchema.default('inside'),
  fmt: formatSchema.optional(),
  q: z.coerce.number().int().min(20).max(95).default(75),
  dpr: z.coerce.number().min(1).max(3).default(1),
  rot: z.coerce
    .number()
    .int()
    .refine((value) => [0, 90, 180, 270].includes(value))
    .default(0),
});

export type RenditionParams = z.infer<typeof renditionParamsSchema>;

export function parseRenditionParamSegment(segment: string, acceptHeader?: string | null): RenditionParams {
  const entries = segment
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [key, value] = part.split('=');
      return [key, value ?? ''] as const;
    });

  const raw = Object.fromEntries(entries);
  const params = renditionParamsSchema.parse(raw);
  return {
    ...params,
    fmt: params.fmt ?? negotiateFormat(acceptHeader),
    w: params.w ? Math.min(4096, Math.round(params.w * params.dpr)) : undefined,
    h: params.h ? Math.min(4096, Math.round(params.h * params.dpr)) : undefined,
  };
}

export function canonicalRenditionParams(params: RenditionParams): string {
  const ordered: Record<string, string | number> = {};
  for (const key of ['w', 'h', 'fit', 'fmt', 'q', 'dpr', 'rot'] as const) {
    const value = params[key];
    if (value !== undefined) ordered[key] = value;
  }
  return Object.entries(ordered)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

export function renditionParamHash(fileId: string, canonicalParams: string): string {
  return createHash('sha256').update(`${fileId}:${canonicalParams}`).digest('hex');
}

export function signRendition(fileId: string, canonicalParams: string, expiresAt?: number): string {
  return createHmac('sha256', renditionSecret())
    .update(`${fileId}:${canonicalParams}:${expiresAt ?? ''}`)
    .digest('base64url');
}

export function verifyRenditionSignature(
  fileId: string,
  canonicalParams: string,
  signature: string | null,
  expiresAt: string | null,
): boolean {
  if (!signature) return false;
  const exp = Number(expiresAt);
  if (!Number.isInteger(exp) || exp <= Date.now()) return false;
  const expected = signRendition(fileId, canonicalParams, exp);
  const expectedBuffer = Buffer.from(expected, 'base64url');
  const actualBuffer = Buffer.from(signature, 'base64url');
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function buildRenditionUrl(fileId: string, params: RenditionParams, needsSignature: boolean): string {
  const canonical = canonicalRenditionParams(params);
  const exp = Date.now() + PRIVATE_RENDITION_TTL_MS;
  const query = needsSignature ? `?exp=${exp}&sig=${encodeURIComponent(signRendition(fileId, canonical, exp))}` : '';
  return `/cdn/${encodeURIComponent(fileId)}/${encodeURIComponent(canonical)}${query}`;
}

export async function getOrCreateRendition({
  file,
  params,
}: {
  file: { id: string; ownerId: string; url: string; private: boolean };
  params: RenditionParams;
}) {
  const canonical = canonicalRenditionParams(params);
  const paramHash = renditionParamHash(file.id, canonical);
  const existing = await prisma.fileRendition.findUnique({ where: { paramHash } });
  if (existing) {
    void prisma.fileRendition.update({ where: { id: existing.id }, data: { lastAccessedAt: new Date() } }).catch(() => undefined);
    return existing;
  }

  const original = await s3Client.send(
    new GetObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: fileS3Key(file.ownerId, file.url),
    }),
  );
  const source = Buffer.from(await original.Body!.transformToByteArray());
  const transformed = await transformImage(source, params);
  const s3Key = `${file.ownerId}/renditions/${file.id}/${paramHash}.${params.fmt}`;

  await new Upload({
    client: s3Client,
    params: {
      Bucket: env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: transformed.buffer,
      ContentType: transformed.contentType,
      ACL: file.private ? 'private' : 'public-read',
      CacheControl: 'public, immutable, max-age=31536000',
    },
  }).done();

  return prisma.fileRendition.create({
    data: {
      sourceFileId: file.id,
      paramHash,
      params: params as unknown as Prisma.InputJsonValue,
      s3Key,
      contentType: transformed.contentType,
      size: transformed.buffer.byteLength,
      width: transformed.width,
      height: transformed.height,
      private: file.private,
    },
  });
}

async function transformImage(source: Buffer, params: RenditionParams) {
  let pipeline = sharp(source, { animated: false }).rotate(params.rot);
  if (params.w || params.h) {
    pipeline = pipeline.resize({
      width: params.w,
      height: params.h,
      fit: params.fit,
      withoutEnlargement: true,
    });
  }

  if (params.fmt === 'avif') pipeline = pipeline.avif({ quality: params.q });
  else if (params.fmt === 'webp') pipeline = pipeline.webp({ quality: params.q });
  else if (params.fmt === 'jpeg') pipeline = pipeline.jpeg({ quality: params.q, mozjpeg: true });
  else pipeline = pipeline.png({ quality: params.q });

  const buffer = await pipeline.toBuffer();
  const metadata = await sharp(buffer).metadata();
  return {
    buffer,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    contentType: `image/${params.fmt === 'jpeg' ? 'jpeg' : params.fmt}`,
  };
}

function negotiateFormat(acceptHeader?: string | null): RenditionParams['fmt'] {
  const accept = acceptHeader ?? '';
  if (accept.includes('image/avif')) return 'avif';
  if (accept.includes('image/webp')) return 'webp';
  return 'jpeg';
}

function renditionSecret(): Buffer {
  return deriveSigningKey('rendition-url', env.RENDITION_SIGNING_SECRET);
}
