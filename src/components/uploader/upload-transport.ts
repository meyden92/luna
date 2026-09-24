import { formatSize } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';

/**
 * Getting one File to `/api/upload/web` and back as a GalleryFile.
 *
 * This is the wire, kept free of React and of any particular upload surface, so
 * the Upload sheet can be redesigned without touching the transport. The
 * validation here mirrors the route's own limits so a file that cannot possibly
 * be accepted is rejected before it is sent.
 */

const MAX_WEB_UPLOAD_BYTES = 200 * 1024 * 1024;

/*
 * The `accept` list for a file input, covering what `isAllowedUploadContentType`
 * below takes so nothing that would upload fine is greyed out in the browse
 * dialog. `accept` only understands the three `image|video|audio/*` wildcards, so
 * the `application/vnd.*` family it also allows is listed by extension instead;
 * `application/octet-stream` is the type a file the OS cannot identify arrives as.
 */
export const UPLOAD_ACCEPT =
  'image/*,video/*,audio/*,text/*,application/gzip,application/json,application/octet-stream,application/pdf,application/x-7z-compressed,application/x-rar-compressed,application/x-tar,application/x-zip-compressed,application/xml,application/zip,.7z,.gz,.json,.pdf,.rar,.tar,.xml,.zip,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp';

function normalizeUploadContentType(contentType: string | null | undefined): string {
  const normalized = contentType?.trim().toLowerCase();
  return normalized || 'application/octet-stream';
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

/**
 * The reason this file cannot be uploaded, or undefined when it can.
 *
 * Returned as a lowercase fragment meant to be read after the file name (see
 * `addFiles` in UploadSheetProvider) — the MIME type a rejection is actually
 * based on means nothing to a person, so it goes to the console instead.
 */
export function getUploadValidationError(file: File): string | undefined {
  if (file.size <= 0) {
    return 'it is empty';
  }
  if (file.size > MAX_WEB_UPLOAD_BYTES) {
    return `it is larger than ${formatSize(MAX_WEB_UPLOAD_BYTES)}`;
  }

  const contentType = normalizeUploadContentType(file.type);
  if (!isAllowedUploadContentType(contentType)) {
    console.warn(`Rejected upload "${file.name}": unsupported content type "${contentType}"`);
    return 'this kind of file can’t be uploaded';
  }

  return undefined;
}

/**
 * Pixel dimensions, read in the browser so the server does not have to decode
 * the image. Non-images and anything the decoder refuses simply have none.
 */
async function readImageDimensions(file: File): Promise<{ width: number; height: number } | undefined> {
  if (!file.type.startsWith('image/')) {
    return undefined;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return undefined;
  }
}

function normalizeUploadedFile(payload: unknown): GalleryFile | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = payload as Partial<GalleryFile> & {
    dbResult?: Partial<GalleryFile>;
    file?: Partial<GalleryFile>;
  };
  const rawFile = candidate.file ?? candidate.dbResult ?? candidate;

  if (!rawFile.id || !rawFile.title || !rawFile.createdAt || !rawFile.ownerId || !rawFile.url || !rawFile.contentType) {
    return undefined;
  }

  return {
    id: rawFile.id,
    title: rawFile.title,
    createdAt: rawFile.createdAt,
    ownerId: rawFile.ownerId,
    folderId: rawFile.folderId ?? null,
    tags: rawFile.tags ?? '',
    url: rawFile.url,
    private: rawFile.private ?? false,
    isDeleted: rawFile.isDeleted ?? false,
    size: rawFile.size ?? 0,
    contentType: rawFile.contentType,
    metadata: rawFile.metadata,
    folder: rawFile.folder ?? null,
  };
}

/**
 * A refusal from the upload route, carrying the route's own `code` so a caller
 * can tell a rejected folder from a network failure without reading messages.
 */
export class UploadError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

function toUploadError(status: number, responseText: string): UploadError {
  try {
    const payload = JSON.parse(responseText) as { error?: unknown; code?: unknown };
    if (typeof payload.error === 'string') {
      return new UploadError(payload.error, typeof payload.code === 'string' ? payload.code : undefined);
    }
  } catch {
    if (responseText) return new UploadError(responseText);
  }

  console.warn(`Upload failed with status ${status}`, responseText);
  return new UploadError('Upload failed, please try again');
}

/**
 * XMLHttpRequest rather than fetch: only XHR reports how many bytes of the
 * request body have gone out, which is what the per-file progress bars show.
 */
function postUpload(formData: FormData, onProgress: (loaded: number, total: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/web');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded, event.total);
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(toUploadError(xhr.status, xhr.responseText));
        return;
      }

      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        // The body is the only clue to why, and it is no use to the person who
        // pressed Upload, so it goes to the console rather than into the toast.
        console.warn('Upload response was not JSON', xhr.responseText);
        reject(new Error('Upload failed, please try again'));
      }
    };

    xhr.onerror = () => reject(new Error('Upload stopped — check your connection'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(formData);
  });
}

/** What every file in a batch shares: where it lands and who can open it. */
export interface UploadOptions {
  folderId: string | null;
  private: boolean;
}

/**
 * Send one file and return it as the gallery knows it.
 *
 * The folder and the visibility travel with the upload rather than being
 * patched on afterwards, so a file marked "Only me" is never briefly a public
 * object. Rejects with an `UploadError` when the route refuses — a folder that
 * has since been deleted comes back as `VALIDATION_FAILED`.
 */
export async function uploadFile(
  file: File,
  options: UploadOptions,
  onProgress: (loaded: number, total: number) => void,
): Promise<GalleryFile | undefined> {
  const dimensions = await readImageDimensions(file);
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('filename', file.name);
  formData.append('private', String(options.private));
  if (options.folderId) {
    formData.append('folderId', options.folderId);
  }
  if (dimensions) {
    formData.append('width', String(dimensions.width));
    formData.append('height', String(dimensions.height));
  }

  return normalizeUploadedFile(await postUpload(formData, onProgress));
}
