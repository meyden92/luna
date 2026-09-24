/**
 * The drag payload a file card writes and a sidebar row reads: a JSON array of
 * file ids. A custom MIME type rather than `text/plain`, so a drag from another
 * application can never be mistaken for one of ours.
 */
export const FILE_DRAG_TYPE = 'application/x-lunashare-files';

/**
 * Whether a drag carries file cards — the only question answerable during
 * dragenter/dragover, where the drag data store is in protected mode and
 * `getData()` returns an empty string however the drag was started.
 */
export function isFileDrag(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes(FILE_DRAG_TYPE);
}

/** Ids from a drag that started on a file card, readable on drop only. */
export function readDraggedFileIds(event: React.DragEvent): string[] | null {
  if (!isFileDrag(event)) return null;
  try {
    const ids: unknown = JSON.parse(event.dataTransfer.getData(FILE_DRAG_TYPE));
    return Array.isArray(ids) && ids.length > 0 ? (ids as string[]) : null;
  } catch {
    return null;
  }
}
