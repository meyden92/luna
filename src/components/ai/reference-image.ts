import { proxyImage } from '@/server/fns/storage';

/**
 * A reference image held by the Edit and Templates tabs: the `File` the edit
 * endpoints upload, plus an object-URL preview to render. Reference images are
 * always materialised as files because `/api/generate/*-image/stream` takes
 * multipart form data, not URLs.
 */
export interface ReferenceImage {
  id: string;
  file: File;
  preview: string;
  width?: number;
  height?: number;
}

/** Natural size of an image, or 0×0 when it cannot be decoded. */
export function loadImageDimensions(preview: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = preview;
  });
}

/**
 * Turns a remote or local image URL into a `ReferenceImage`. Remote URLs go
 * through the storage proxy so a cross-origin CDN response is still readable.
 */
export async function referenceImageFromUrl(imageUrl: string, id: string): Promise<ReferenceImage> {
  const response =
    imageUrl.startsWith('blob:') || imageUrl.startsWith('data:') ? await fetch(imageUrl) : await proxyImage({ data: { imageUrl } });

  const blob = await response.blob();
  const filename = imageUrl.split('/').pop()?.split('?')[0] || 'reference-image.png';
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  const preview = URL.createObjectURL(blob);
  const { width, height } = await loadImageDimensions(preview);

  return { id, file, preview, width, height };
}

/** `ReferenceImage`s for a list of image URLs, skipping blanks. */
export function referenceImagesFromUrls(urls: string[], idPrefix: string): Promise<ReferenceImage[]> {
  const timestamp = Date.now();
  return Promise.all(urls.filter(Boolean).map((url, index) => referenceImageFromUrl(url, `${idPrefix}-${timestamp}-${index}`)));
}
