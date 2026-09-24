import { createContext, useContext } from 'react';

/**
 * The one upload controller. Uploading is a global action, not a Files feature:
 * the nav button, a file dropped anywhere on the window and a ⌘V paste all open
 * the same sheet and add to the same queue, so they share this context rather
 * than each owning a queue of their own.
 */
export type UploadSheetApi = {
  /** Open the sheet, queueing files that arrived with the gesture (a drop, a paste). */
  open: (files?: readonly File[]) => void;
  /**
   * The folder new uploads land in by default. Files keeps this in step with
   * the folder currently open, so uploading while inside a folder stays there.
   */
  setDefaultFolderId: (folderId: string | null) => void;
};

export const UploadSheetContext = createContext<UploadSheetApi | null>(null);

/**
 * Only meaningful inside the app shell, where the provider is mounted. The
 * marketing pages have no upload action, so this throws rather than silently
 * doing nothing.
 */
export function useUploadSheet(): UploadSheetApi {
  const api = useContext(UploadSheetContext);
  if (!api) {
    throw new Error('useUploadSheet must be used inside UploadSheetProvider');
  }
  return api;
}
