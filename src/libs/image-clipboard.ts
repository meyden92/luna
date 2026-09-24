/**
 * Putting an image on the clipboard, so it can be pasted straight into a chat
 * or a document. The Files cards, the Preview and the Generate results all need
 * it; `useClipboard` only writes text.
 */

/**
 * Fetch an image and hand back a PNG.
 *
 * Browsers only accept `image/png` on the clipboard, so a webp, jpeg or avif
 * original is re-encoded through a canvas first.
 */
async function fetchAsPng(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read the image: ${response.status}`);

  const blob = await response.blob();
  if (blob.type === 'image/png') return blob;

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('Could not encode the image'))), 'image/png');
  });
}

/**
 * Copy the image at `url`.
 *
 * The blob is handed to `ClipboardItem` as a promise rather than awaited first,
 * because `clipboard.write` has to be reached while the click or keypress that
 * asked for it still counts as a user gesture. Rejects on failure so the caller
 * can say so — this module shows nothing itself.
 */
export async function copyImageToClipboard(url: string): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': fetchAsPng(url) })]);
}
