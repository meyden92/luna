import { format, isToday, isYesterday } from 'date-fns';
import { getCDNImage } from '@/libs/utils';

/**
 * The file on the Preview stage.
 *
 * This is the seam between the Files gallery, which owns `previewId`, and the
 * Preview. It carries the storage key and the owner id so the stage can read
 * from the CDN rather than through the app server.
 */
export type PreviewFile = {
  id: string;
  name: string;
  size: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  createdAt: Date | string;
  isPrivate: boolean;
  folderId: string | null;
  /** The storage key, which with the owner id gives the CDN address. */
  url: string;
  ownerId: string;
};

/**
 * The file's own address on the CDN — the same one the card's thumbnail and a
 * middle-click use.
 *
 * `/api/d/:id` would also answer, and for a private file it is the only thing
 * that will, but routing every full-size view through the app server would put
 * the bytes on a connection with a 10s idle timeout in production and record
 * egress against a view the owner is taking of their own file.
 */
export function previewFileUrl(file: PreviewFile): string {
  return getCDNImage(`/${file.ownerId}/${file.url}`);
}

/** The public share page a "Copy link" hands out. */
export function previewShareUrl(fileId: string): string {
  return `${window.location.origin}/view/${fileId}`;
}

/** Only an image can go on the stage, or onto the clipboard as an image. */
export function isPreviewImage(mimeType: string | null): boolean {
  return Boolean(mimeType?.startsWith('image/'));
}

/**
 * The short type label the panel shows twice — in the metadata line and in the
 * details list. The file name is the better source ("shot.png" → "PNG") because
 * a mime subtype can be a mouthful (`image/svg+xml`); the subtype is the
 * fallback for a name with no extension.
 */
export function previewTypeLabel(file: PreviewFile): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : undefined;
  if (extension) return extension.toUpperCase().slice(0, 5);
  const subtype = file.mimeType?.split('/')[1];
  return subtype ? subtype.toUpperCase().slice(0, 5) : 'FILE';
}

/** The extension as it reads on the stage placeholder for a non-image: ".pdf". */
export function previewExtensionLabel(file: PreviewFile): string {
  return `.${previewTypeLabel(file).toLowerCase()}`;
}

/** "Today, 14:02" · "Yesterday, 09:31" · "12 Mar 2026, 14:02". */
export function formatUploadedAt(createdAt: Date | string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const time = format(date, 'HH:mm');
  if (isToday(date)) return `Today, ${time}`;
  if (isYesterday(date)) return `Yesterday, ${time}`;
  return `${format(date, 'd MMM yyyy')}, ${time}`;
}
