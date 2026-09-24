/**
 * The drag payload a file card writes and a sidebar row reads: a JSON array of
 * file ids. A custom MIME type rather than `text/plain`, so a drag from another
 * application can never be mistaken for one of ours.
 */
export const FILE_DRAG_TYPE = 'application/x-lunashare-files';

/** Ids from a drag that started on a file card, or null for any other drag. */
export function readDraggedFileIds(event: React.DragEvent): string[] | null {
  if (!event.dataTransfer.types.includes(FILE_DRAG_TYPE)) return null;
  try {
    const ids: unknown = JSON.parse(event.dataTransfer.getData(FILE_DRAG_TYPE));
    return Array.isArray(ids) && ids.length > 0 ? (ids as string[]) : null;
  } catch {
    return null;
  }
}
