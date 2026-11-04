import type { JsonValue } from '@/db/schema/json';
import { isRecord } from '@/libs/is-record';
import type { MediaKind } from './types';

/**
 * Finds the Outputs in a fal result. fal results have no common shape, but
 * every file in them is an object with a `url` and a `content_type` (fal's
 * `File`/`Image`/`Video` types), wherever it sits. Pure.
 */

export interface ExtractedOutput {
  url: string;
  contentType: string;
  mediaKind: MediaKind;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

const EXTENSION_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
};

const TYPE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
};

export function mediaKindOf(contentType: string): MediaKind | null {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('model/gltf')) return 'model3d';
  return null;
}

function urlExtension(url: string): string | null {
  const path = URL.canParse(url) ? new URL(url).pathname : url;
  const match = /\.([a-z0-9]{2,5})$/i.exec(path);
  return match?.[1]?.toLowerCase() ?? null;
}

/** The extension for an Output's S3 key: from the content type, else the URL, else `bin`. */
export function outputExtension(contentType: string, url: string): string {
  return TYPE_EXTENSIONS[contentType] ?? urlExtension(url) ?? 'bin';
}

function positiveNumber(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function toOutput(value: Record<string, JsonValue>): ExtractedOutput | null {
  const { url, content_type: declared } = value;
  if (typeof url !== 'string' || typeof declared !== 'string') return null;
  // Generic types such as application/octet-stream: trust the extension instead.
  const extensionType = EXTENSION_TYPES[urlExtension(url) ?? ''];
  const contentType = mediaKindOf(declared) ? declared : extensionType;
  const mediaKind = contentType ? mediaKindOf(contentType) : null;
  if (!contentType || !mediaKind) return null;
  return {
    url,
    contentType,
    mediaKind,
    width: positiveNumber(value.width),
    height: positiveNumber(value.height),
    durationSeconds: positiveNumber(value.duration),
  };
}

/** Every media file in `result`, depth first in document order. */
export function extractOutputs(result: JsonValue): ExtractedOutput[] {
  const outputs: ExtractedOutput[] = [];
  const walk = (value: JsonValue) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.url === 'string' && typeof value.content_type === 'string') {
      const output = toOutput(value);
      if (output) outputs.push(output);
      return;
    }
    for (const child of Object.values(value)) walk(child);
  };
  walk(result);
  return outputs;
}
