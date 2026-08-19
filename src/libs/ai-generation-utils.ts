import crypto from 'node:crypto';
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type Replicate from 'replicate';
import type { Prediction } from 'replicate';
import { writeCreateAuditLog } from '@/libs/audit/transaction-audit';
import prisma from '@/libs/prismadb';
import { getCdnUrl } from '@/libs/runtime-config';
import { s3Client } from '@/libs/S3Helper';
import { ensureStorageQuotaAvailableViaPrisma, StorageQuotaExceededError } from '@/libs/storage-quota';
import { getCDNImage } from '@/libs/utils';
import { env } from './env';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

export type SseSend = (payload: unknown) => void;

type AiModelField = {
  name: string;
  label: string;
  type: string;
  isRequired: boolean;
  defaultValue: string | null;
  minValue: string | null;
  maxValue: string | null;
  enumOptions: string | null;
  isReadonly: boolean;
};

type FieldValidationResult = { ok: true; input: Record<string, unknown> } | { ok: false; error: string };

type UploadImageOptions = {
  imageUrl: string;
  fileName: string;
  userId: string;
  tags: string;
  title: string;
  signal?: AbortSignal;
  logPrefix: string;
};

type CachedImageOptions = {
  images: File[];
  userId: string;
  send: SseSend;
  purpose: string;
  logPrefix: string;
  signal?: AbortSignal;
  useCombinedCache?: boolean;
  cacheControl?: string;
};

type CachedImageRow = {
  url: string;
  hash: string;
  userId: string;
  filename?: string;
  size: number;
  purpose: string;
};

export function normalizeReplicateOutput(output: unknown): string[] {
  if (typeof output === 'string') return output ? [output] : [];
  if (!Array.isArray(output)) return [];
  return output.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function firstReplicateOutput(output: unknown): string | null {
  return normalizeReplicateOutput(output)[0] ?? null;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException('Aborted', 'AbortError');
}

function hasEmptyFieldValue(value: unknown): boolean {
  return !value || value === '';
}

function parseDefaultFieldValue(field: AiModelField): unknown {
  if (field.type === 'number') return Number.parseFloat(field.defaultValue ?? '');
  if (field.type === 'boolean') return field.defaultValue === 'true';
  return field.defaultValue;
}

function parseEnumValues(enumOptions: string | null): string[] {
  if (!enumOptions) return [];

  try {
    const parsed = JSON.parse(enumOptions);
    if (Array.isArray(parsed)) {
      return parsed.flatMap((option) => {
        if (option && typeof option === 'object' && 'value' in option && typeof option.value === 'string') return [option.value];
        if (typeof option === 'string') return [option];
        return [];
      });
    }
  } catch {
    return enumOptions.split(',').map((option) => option.trim());
  }

  return [];
}

export function validateAiModelFields(fields: AiModelField[], readValue: (fieldName: string) => unknown): FieldValidationResult {
  const input: Record<string, unknown> = {};

  for (const field of fields) {
    if (field.isReadonly) {
      if (field.defaultValue) input[field.name] = parseDefaultFieldValue(field);
      continue;
    }

    let value = readValue(field.name);
    if (hasEmptyFieldValue(value) && field.defaultValue) value = field.defaultValue;

    if (field.isRequired && hasEmptyFieldValue(value)) {
      return { ok: false, error: `Field "${field.label}" is required` };
    }
    if (hasEmptyFieldValue(value)) continue;

    if (field.type === 'number') {
      const num = Number.parseFloat(String(value));
      if (Number.isNaN(num)) return { ok: false, error: `Field "${field.label}" must be a number` };
      if (field.minValue != null && num < Number.parseFloat(field.minValue)) {
        return { ok: false, error: `Field "${field.label}" must be at least ${field.minValue}` };
      }
      if (field.maxValue != null && num > Number.parseFloat(field.maxValue)) {
        return { ok: false, error: `Field "${field.label}" must be at most ${field.maxValue}` };
      }
      input[field.name] = num;
      continue;
    }

    if (field.type === 'boolean') {
      input[field.name] = value === 'true' || value === true;
      continue;
    }

    if (field.type === 'enum') {
      const valid = parseEnumValues(field.enumOptions);
      const stringValue = String(value);
      if (!valid.includes(stringValue)) {
        return { ok: false, error: `Field "${field.label}" must be one of: ${valid.join(', ')}` };
      }
      input[field.name] = value;
      continue;
    }

    input[field.name] = value;
  }

  return { ok: true, input };
}

export function createPredictionAbortRegistry(
  requestSignal: AbortSignal,
  cancelPrediction: (predictionId: string) => Promise<unknown>,
  logPrefix: string,
): {
  signal: AbortSignal;
  registerPrediction: (predictionId: string) => void;
  abortWork: () => void;
  cleanup: () => void;
} {
  const abortController = new AbortController();
  const abortSignal = abortController.signal;
  const predictionIds = new Set<string>();
  const canceledPredictionIds = new Set<string>();

  const cancelRegisteredPrediction = (predictionId: string) => {
    if (canceledPredictionIds.has(predictionId)) return;
    canceledPredictionIds.add(predictionId);
    void cancelPrediction(predictionId).catch((error: unknown) =>
      console.error(`${logPrefix} cancel prediction failed`, predictionId, error),
    );
  };

  const abortWork = () => {
    if (!abortSignal.aborted) abortController.abort();
    for (const predictionId of predictionIds) cancelRegisteredPrediction(predictionId);
  };

  const registerPrediction = (predictionId: string) => {
    predictionIds.add(predictionId);
    if (abortSignal.aborted) cancelRegisteredPrediction(predictionId);
  };

  if (requestSignal.aborted) abortWork();
  else requestSignal.addEventListener('abort', abortWork, { once: true });

  return {
    signal: abortSignal,
    registerPrediction,
    abortWork,
    cleanup: () => requestSignal.removeEventListener('abort', abortWork),
  };
}

export function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export function eventStreamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

export function uploadGeneratedImageErrorMessage(error: unknown, fallback: string): string {
  return error instanceof StorageQuotaExceededError ? error.message : fallback;
}

async function deleteUploadedObject(key: string, logPrefix: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }));
  } catch (error) {
    console.error(`${logPrefix} failed to delete uploaded object after DB failure`, error);
  }
}

export async function uploadGeneratedImageToS3({
  imageUrl,
  fileName,
  userId,
  tags,
  title,
  signal,
  logPrefix,
}: UploadImageOptions): Promise<{ url: string; fileId: string }> {
  throwIfAborted(signal);
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  const uploadBuffer = Buffer.from(arrayBuffer);
  const key = `${userId}/${fileName}`;

  throwIfAborted(signal);
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
      Body: uploadBuffer,
      ContentType: 'image/png',
      ACL: 'public-read',
      CacheControl: 'max-age=31536000',
    },
  });

  const abortUpload = () => void upload.abort().catch((error: unknown) => console.error(`${logPrefix} abort result upload failed`, error));
  signal?.addEventListener('abort', abortUpload, { once: true });
  try {
    await upload.done();
  } finally {
    signal?.removeEventListener('abort', abortUpload);
  }

  throwIfAborted(signal);
  let dbResult: { id: string; url: string };
  try {
    dbResult = await prisma.$transaction(async (tx) => {
      await ensureStorageQuotaAvailableViaPrisma(tx, userId, uploadBuffer.byteLength);
      const createdFile = await tx.file.create({
        data: {
          ownerId: userId,
          size: uploadBuffer.byteLength,
          url: encodeURIComponent(fileName),
          private: false,
          tags,
          title,
          contentType: 'image/png',
        },
      });
      await writeCreateAuditLog(tx, { model: 'File', record: createdFile, userId });

      return { id: createdFile.id, url: createdFile.url };
    });
  } catch (error) {
    await deleteUploadedObject(key, logPrefix);
    throw error;
  }

  return { url: getCDNImage(`/${userId}/${dbResult.url}`), fileId: dbResult.id };
}

function hashImageBuffer(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

async function upsertCachedImageRow({ url, hash, userId, filename, size, purpose }: CachedImageRow): Promise<void> {
  const data = {
    url,
    filename: filename || `cached-${hash}.png`,
    contentType: 'image/png',
    size,
    hash,
    purpose,
    ownerId: userId,
  };

  await prisma.cachedImage.upsert({
    where: { ownerId_hash: { ownerId: userId, hash } },
    update: {
      url,
      filename: data.filename,
      contentType: data.contentType,
      size: data.size,
      purpose,
      lastAccessedAt: new Date(),
    },
    create: data,
  });
}

async function checkImageCache(hash: string, userId: string, signal?: AbortSignal): Promise<{ url: string; hasOwnerRow: boolean } | null> {
  throwIfAborted(signal);
  const cached = await prisma.cachedImage.findUnique({ where: { ownerId_hash: { ownerId: userId, hash } } });
  if (cached) {
    throwIfAborted(signal);
    await prisma.cachedImage.update({ where: { ownerId_hash: { ownerId: userId, hash } }, data: { lastAccessedAt: new Date() } });
    return { url: cached.url, hasOwnerRow: true };
  }

  const cacheKey = `cache/${hash}.png`;
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: cacheKey }));
    return { url: `${getCdnUrl()}/${cacheKey}`, hasOwnerRow: false };
  } catch {
    return null;
  }
}

function getCacheHashFromUrl(urlValue: string): string | null {
  try {
    const url = new URL(urlValue);
    const fileName = url.pathname.split('/').pop();
    if (!fileName?.endsWith('.png')) return null;
    return fileName.slice(0, -'.png'.length);
  } catch {
    return null;
  }
}

async function uploadImageToCache(
  buffer: Buffer,
  hash: string,
  userId: string,
  filename: string | undefined,
  purpose: string,
  logPrefix: string,
  options: {
    cacheControl?: string;
  },
  signal?: AbortSignal,
): Promise<string> {
  const cacheKey = `cache/${hash}.png`;
  throwIfAborted(signal);
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: env.AWS_BUCKET_NAME,
      Key: cacheKey,
      Body: buffer,
      ContentType: 'image/png',
      ACL: 'public-read',
      ...(options.cacheControl ? { CacheControl: options.cacheControl } : {}),
      Metadata: { uploaded_at: new Date().toISOString(), originalImageHash: hash },
    },
  });

  const abortUpload = () => void upload.abort().catch((error: unknown) => console.error(`${logPrefix} abort cache upload failed`, error));
  signal?.addEventListener('abort', abortUpload, { once: true });
  try {
    await upload.done();
  } finally {
    signal?.removeEventListener('abort', abortUpload);
  }

  const url = `${getCdnUrl()}/${cacheKey}`;
  throwIfAborted(signal);
  await upsertCachedImageRow({
    url,
    hash,
    userId,
    filename,
    size: buffer.length,
    purpose,
  });

  return url;
}

async function checkMultipleImageCache(combinedHash: string, hashes: string[], signal?: AbortSignal): Promise<string[] | null> {
  throwIfAborted(signal);
  const cacheKey = `cache/multi_${combinedHash}.json`;
  try {
    const response = await fetch(`${getCdnUrl()}/${cacheKey}`, { signal });
    if (!response.ok) return null;
    const data = await response.json();
    const imageUrls = Array.isArray(data.imageUrls) ? data.imageUrls.filter((url: unknown): url is string => typeof url === 'string') : [];
    if (imageUrls.length !== hashes.length) return null;

    const urlsByHash = new Map<string, string>();
    for (const url of imageUrls) {
      const hash = getCacheHashFromUrl(url);
      if (hash) urlsByHash.set(hash, url);
    }

    const orderedUrls = hashes.map((hash) => urlsByHash.get(hash));
    if (orderedUrls.some((url): url is undefined => !url)) return null;
    const verifiedUrls = orderedUrls as string[];

    for (const url of verifiedUrls) {
      throwIfAborted(signal);
      const headResponse = await fetch(url, { method: 'HEAD', signal });
      if (!headResponse.ok) return null;
    }

    return verifiedUrls;
  } catch {
    return null;
  }
}

async function uploadMultipleImageCache(combinedHash: string, urls: string[], logPrefix: string, signal?: AbortSignal): Promise<void> {
  const cacheKey = `cache/multi_${combinedHash}.json`;
  throwIfAborted(signal);
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: env.AWS_BUCKET_NAME,
      Key: cacheKey,
      Body: JSON.stringify({ imageUrls: urls, uploaded_at: new Date().toISOString(), expire_in: '1800' }),
      ContentType: 'application/json',
      ACL: 'public-read',
    },
  });

  const abortUpload = () =>
    void upload.abort().catch((error: unknown) => console.error(`${logPrefix} abort multi-cache upload failed`, error));
  signal?.addEventListener('abort', abortUpload, { once: true });
  try {
    await upload.done();
  } finally {
    signal?.removeEventListener('abort', abortUpload);
  }
}

export async function processCachedImages({
  images,
  userId,
  send,
  purpose,
  logPrefix,
  signal,
  useCombinedCache = false,
  cacheControl,
}: CachedImageOptions): Promise<{ imageUrls: string[]; allCached: boolean }> {
  const hashes: string[] = [];
  const buffers: Buffer[] = [];

  for (const image of images) {
    throwIfAborted(signal);
    const buffer = Buffer.from(await image.arrayBuffer());
    hashes.push(hashImageBuffer(buffer));
    buffers.push(buffer);
  }

  const combinedHash = crypto
    .createHash('md5')
    .update([...hashes].sort().join('|'))
    .digest('hex');

  if (useCombinedCache) {
    const cachedUrls = await checkMultipleImageCache(combinedHash, hashes, signal);
    if (cachedUrls) {
      for (let index = 0; index < cachedUrls.length; index++) {
        const url = cachedUrls[index];
        const hash = hashes[index];
        const buffer = buffers[index];
        if (!url || !hash || !buffer) continue;

        throwIfAborted(signal);
        await upsertCachedImageRow({
          url,
          hash,
          userId,
          filename: images[index]?.name,
          size: buffer.length,
          purpose,
        });
      }

      return { imageUrls: cachedUrls, allCached: true };
    }
  }

  const urls: string[] = [];
  for (let index = 0; index < images.length; index++) {
    const hash = hashes[index];
    const buffer = buffers[index];
    if (!hash || !buffer) continue;

    throwIfAborted(signal);
    const cached = await checkImageCache(hash, userId, signal);
    let url = cached?.url;
    if (cached && !cached.hasOwnerRow) {
      await upsertCachedImageRow({
        url: cached.url,
        hash,
        userId,
        filename: images[index]?.name,
        size: buffer.length,
        purpose,
      });
    }
    if (!cached) {
      send({
        status: 'uploading',
        progress: 5 + Math.round((index / images.length) * 10),
        message: `Uploading image ${index + 1}/${images.length}...`,
      });
      url = await uploadImageToCache(buffer, hash, userId, images[index]?.name, purpose, logPrefix, { cacheControl }, signal);
    }
    if (!url) continue;
    urls.push(url);
  }

  if (useCombinedCache) await uploadMultipleImageCache(combinedHash, urls, logPrefix, signal);
  return { imageUrls: urls, allCached: false };
}

export function createSseWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  options: { signal?: AbortSignal; mapPayload?: (payload: unknown) => unknown } = {},
): { send: SseSend; close: () => void } {
  const encoder = new TextEncoder();
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      /* stream already canceled */
    }
  };

  const send: SseSend = (payload) => {
    if (closed || options.signal?.aborted) return;
    const data = options.mapPayload ? options.mapPayload(payload) : payload;
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  return { send, close };
}

export async function pollReplicatePrediction(
  client: Replicate,
  prediction: Prediction,
  options: {
    signal?: AbortSignal;
    intervalMs?: number;
    maxRetries?: number;
    onProgress?: (state: { retries: number; prediction: Prediction }) => void | Promise<void>;
  } = {},
): Promise<{ retries: number; timedOut: boolean; prediction: Prediction }> {
  const intervalMs = options.intervalMs ?? 2000;
  const maxRetries = options.maxRetries ?? 120;
  let retries = 0;
  let currentPrediction = prediction;

  while (currentPrediction.status !== 'succeeded' && currentPrediction.status !== 'failed' && retries < maxRetries) {
    await waitFor(intervalMs, options.signal);
    currentPrediction = await client.predictions.get(currentPrediction.id, { signal: options.signal });
    retries++;
    await options.onProgress?.({ retries, prediction: currentPrediction });
  }

  return { retries, timedOut: retries >= maxRetries, prediction: currentPrediction };
}
