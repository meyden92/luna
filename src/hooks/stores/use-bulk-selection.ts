import { create } from 'zustand';

interface BulkSelectionState {
  selectedFiles: Set<string>;
  toggleFile: (fileId: string) => void;
  selectFiles: (fileIds: string[]) => void;
  deselectFiles: (fileIds: string[]) => void;
  clearSelection: () => void;
}

/**
 * Which files are selected in Files.
 *
 * There is no explicit "select mode" any more: a card shows its check on hover,
 * and every card shows one once anything is selected, so the mode is simply
 * whether the set is empty.
 */
export const useBulkSelection = create<BulkSelectionState>((set) => ({
  selectedFiles: new Set<string>(),

  toggleFile: (fileId) =>
    set((state) => {
      const next = new Set(state.selectedFiles);
      if (!next.delete(fileId)) next.add(fileId);
      return { selectedFiles: next };
    }),

  selectFiles: (fileIds) =>
    set((state) => {
      const next = new Set(state.selectedFiles);
      for (const fileId of fileIds) next.add(fileId);
      return { selectedFiles: next };
    }),

  deselectFiles: (fileIds) =>
    set((state) => {
      const next = new Set(state.selectedFiles);
      for (const fileId of fileIds) next.delete(fileId);
      return { selectedFiles: next };
    }),

  clearSelection: () => set({ selectedFiles: new Set<string>() }),
}));
