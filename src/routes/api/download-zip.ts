import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { listOwnedActiveFiles } from '@/db/queries/files';
import { env } from '@/libs/env';
import { ForbiddenError, requireAuthenticatedUser } from '@/libs/rbac/guards';
import { fileS3Key, s3Client } from '@/libs/S3Helper';

const ZIP_FLAG_DATA_DESCRIPTOR = 0x0008;
const ZIP_FLAG_UTF8 = 0x0800;
const ZIP_FLAGS = ZIP_FLAG_DATA_DESCRIPTOR | ZIP_FLAG_UTF8;
const ZIP_STORE_METHOD = 0;
const ZIP_VERSION = 20;
const ZIP32_MAX_VALUE = 0xffffffff;
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

const downloadZipSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

type DownloadFile = {
  id: string;
  url: string;
  title: string;
  size: number;
  updatedAt: Date;
};

type CentralDirectoryEntry = {
  fileName: Uint8Array;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  modifiedAt: Date;
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  crcTable[i] = crc >>> 0;
}

function updateCrc32(crc: number, chunk: Uint8Array): number {
  let next = crc;
  for (const byte of chunk) {
    next = (next >>> 8) ^ (crcTable[(next ^ byte) & 0xff] ?? 0);
  }
  return next >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function concatChunks(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function dosTimestamp(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function sanitizeZipName(name: string): string {
  return (
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ') || 'download'
  );
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function uniqueZipName(file: DownloadFile, usedNames: Map<string, number>): string {
  const fallback = safeDecode(file.url)?.split('/').pop() || file.id;
  const cleanName = sanitizeZipName(file.title || fallback);
  const nextCount = usedNames.get(cleanName) ?? 0;
  usedNames.set(cleanName, nextCount + 1);

  if (nextCount === 0) return cleanName;

  const dotIndex = cleanName.lastIndexOf('.');
  if (dotIndex <= 0) return `${cleanName}-${nextCount + 1}`;
  return `${cleanName.slice(0, dotIndex)}-${nextCount + 1}${cleanName.slice(dotIndex)}`;
}

function localFileHeader(fileName: Uint8Array, modifiedAt: Date): Uint8Array {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  const timestamp = dosTimestamp(modifiedAt);

  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, ZIP_VERSION);
  writeUint16(view, 6, ZIP_FLAGS);
  writeUint16(view, 8, ZIP_STORE_METHOD);
  writeUint16(view, 10, timestamp.time);
  writeUint16(view, 12, timestamp.date);
  writeUint16(view, 26, fileName.length);

  return concatChunks(header, fileName);
}

function dataDescriptor(crc: number, size: number): Uint8Array {
  const descriptor = new Uint8Array(16);
  const view = new DataView(descriptor.buffer);

  writeUint32(view, 0, 0x08074b50);
  writeUint32(view, 4, crc);
  writeUint32(view, 8, size);
  writeUint32(view, 12, size);

  return descriptor;
}

function centralDirectoryHeader(entry: CentralDirectoryEntry): Uint8Array {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  const timestamp = dosTimestamp(entry.modifiedAt);

  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, ZIP_VERSION);
  writeUint16(view, 6, ZIP_VERSION);
  writeUint16(view, 8, ZIP_FLAGS);
  writeUint16(view, 10, ZIP_STORE_METHOD);
  writeUint16(view, 12, timestamp.time);
  writeUint16(view, 14, timestamp.date);
  writeUint32(view, 16, entry.crc);
  writeUint32(view, 20, entry.compressedSize);
  writeUint32(view, 24, entry.uncompressedSize);
  writeUint16(view, 28, entry.fileName.length);
  writeUint32(view, 42, entry.localHeaderOffset);

  return concatChunks(header, entry.fileName);
}

function endOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralDirectorySize);
  writeUint32(view, 16, centralDirectoryOffset);

  return header;
}

async function* bodyChunks(body: unknown): AsyncGenerator<Uint8Array> {
  if (!body) return;

  if (body instanceof Uint8Array) {
    yield body;
    return;
  }

  if (body instanceof Blob) {
    yield new Uint8Array(await body.arrayBuffer());
    return;
  }

  if (typeof body === 'object' && Symbol.asyncIterator in body) {
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      yield typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
    }
    return;
  }

  if (typeof body === 'object' && 'transformToWebStream' in body && typeof body.transformToWebStream === 'function') {
    const reader = (body.transformToWebStream() as ReadableStream<Uint8Array>).getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

function createZipStream(files: DownloadFile[], userId: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const usedNames = new Map<string, number>();
      const centralDirectory: CentralDirectoryEntry[] = [];
      let offset = 0;

      const enqueue = (chunk: Uint8Array) => {
        controller.enqueue(chunk);
        offset += chunk.length;
      };

      try {
        for (const file of files) {
          const fileName = encoder.encode(uniqueZipName(file, usedNames));
          if (fileName.length > 0xffff) throw new Error('ZIP filename is too long');

          const localHeaderOffset = offset;
          enqueue(localFileHeader(fileName, file.updatedAt));

          const object = await s3Client.send(new GetObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: fileS3Key(userId, file.url) }), {
            abortSignal: signal,
          });
          if (!object.Body) throw new Error('Empty S3 response body');

          let crc = 0xffffffff;
          let size = 0;

          for await (const chunk of bodyChunks(object.Body)) {
            crc = updateCrc32(crc, chunk);
            size += chunk.length;
            if (size > ZIP32_MAX_VALUE || offset + chunk.length > ZIP32_MAX_VALUE) throw new Error('ZIP32 size limit exceeded');
            enqueue(chunk);
          }

          const finalCrc = (crc ^ 0xffffffff) >>> 0;
          enqueue(dataDescriptor(finalCrc, size));
          centralDirectory.push({
            fileName,
            crc: finalCrc,
            compressedSize: size,
            uncompressedSize: size,
            localHeaderOffset,
            modifiedAt: file.updatedAt,
          });
        }

        const centralDirectoryOffset = offset;
        if (centralDirectoryOffset > ZIP32_MAX_VALUE) throw new Error('ZIP32 central directory offset limit exceeded');
        for (const entry of centralDirectory) {
          enqueue(centralDirectoryHeader(entry));
        }
        const centralDirectorySize = offset - centralDirectoryOffset;
        if (centralDirectorySize > ZIP32_MAX_VALUE) throw new Error('ZIP32 central directory size limit exceeded');
        enqueue(endOfCentralDirectory(centralDirectory.length, centralDirectorySize, centralDirectoryOffset));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function handle(request: Request): Promise<Response> {
  let userId: string;
  try {
    const user = await requireAuthenticatedUser(request.headers);
    userId = user.id;
  } catch (error) {
    return error instanceof ForbiddenError ? json({ error: 'Forbidden' }, 403) : json({ error: 'Unauthorized' }, 401);
  }

  let ids: string[];
  try {
    const body = await request.json();
    ids = [...new Set(downloadZipSchema.parse(body).ids)];
  } catch {
    return json({ error: 'Invalid download request' }, 400);
  }

  // One statement for the whole archive, never one per file: `listOwnedActiveFiles`
  // is a single `id = ANY($1) AND owner_id = $2 AND is_deleted = false` select.
  const rows = await listOwnedActiveFiles(ids, userId);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  // Narrowed to "the row exists" rather than to DownloadFile: the query returns
  // whole file rows, of which DownloadFile is the subset the ZIP writer reads.
  const files = ids.map((id) => rowsById.get(id)).filter((file): file is NonNullable<typeof file> => Boolean(file));

  if (files.length !== ids.length) return json({ error: 'One or more files could not be downloaded' }, 404);

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_ZIP_BYTES) {
    return json({ error: 'Selected files are too large for one ZIP download' }, 413);
  }

  return new Response(createZipStream(files, userId, request.signal), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="lunashare-${files.length}-files.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const Route = createFileRoute('/api/download-zip')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
