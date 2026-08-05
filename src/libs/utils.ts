import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { File, FileText, FolderArchive, Music, Video } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FORMAT_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const FORMAT_SIZE_BASE = 1024;

type FormatSizeUnit = (typeof FORMAT_SIZE_UNITS)[number];

type FormatSizeOptions = {
  precision?: number;
  trim?: boolean;
  maxUnit?: FormatSizeUnit;
  unit?: FormatSizeUnit;
  byteUnit?: 'B' | 'Bytes';
  empty?: string;
};

export function formatSize(size: number | null | undefined, options: FormatSizeOptions = {}): string {
  const byteUnit = options.byteUnit ?? 'B';
  const empty = options.empty ?? `0 ${byteUnit}`;

  if (size == null || size === 0) {
    return empty;
  }

  const maxUnitIndex = FORMAT_SIZE_UNITS.indexOf(options.maxUnit ?? 'GB');
  const unitIndex = options.unit
    ? FORMAT_SIZE_UNITS.indexOf(options.unit)
    : Math.min(size < FORMAT_SIZE_BASE ? 0 : Math.floor(Math.log(size) / Math.log(FORMAT_SIZE_BASE)), maxUnitIndex);
  const resolvedUnit = FORMAT_SIZE_UNITS[unitIndex] ?? 'GB';
  const unitLabel = resolvedUnit === 'B' ? byteUnit : resolvedUnit;
  const precision = options.precision ?? 2;
  const formattedValue =
    unitIndex === 0 && options.precision === undefined ? String(size) : (size / FORMAT_SIZE_BASE ** unitIndex).toFixed(precision);

  return `${options.trim ? Number.parseFloat(formattedValue) : formattedValue} ${unitLabel}`;
}

const validImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'jfif', 'pjpeg', 'pjp'];

export const isPreviewableFile = (filetype: string) => {
  if (filetype.startsWith('image/')) {
    return true;
  }
  return validImageExtensions.includes(filetype);
};

const cdnUrl = import.meta.env.VITE_PUBLIC_CDN_URL;

export function getCDNImage(image: string | null | undefined, userId?: string, fallback?: string) {
  if (userId && image) {
    return `${cdnUrl}/${userId}/${image}`;
  }
  if (image) {
    return cdnUrl + image;
  }

  return fallback || '/placeholders/file.png';
}

export function getTemplateImageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${cdnUrl}/${path}`;
}

export function getFileIcon(contentType: string) {
  if (contentType.startsWith('audio/')) return Music;
  if (contentType.startsWith('video/')) return Video;
  if (contentType.includes('pdf')) return FileText;
  if (contentType.includes('zip') || contentType.includes('archive')) return FolderArchive;
  return File;
}
