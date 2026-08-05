import { create } from 'zustand';

export type DaySelectionState = 'unchecked' | 'indeterminate' | 'checked';

interface BulkSelectionState {
  selectedFiles: Set<string>;
  /** Explicit select mode (toolbar toggle) — cards show their check affordance permanently. */
  selectMode: boolean;
  setSelectMode: (selectMode: boolean) => void;
  toggleFile: (fileId: string) => void;
  selectFiles: (fileIds: string[]) => void;
  deselectFiles: (fileIds: string[]) => void;
  clearSelection: () => void;
}

export const isFileSelected = (selectedFiles: Set<string>, fileId: string): boolean => selectedFiles.has(fileId);

export const getSelectedCount = (selectedFiles: Set<string>): number => selectedFiles.size;

export const getSelectedFileIds = (selectedFiles: Set<string>): string[] => Array.from(selectedFiles);

export function getDaySelectionState(selectedFiles: Set<string>, fileIds: string[]): DaySelectionState {
  const selectedCount = fileIds.filter((id) => selectedFiles.has(id)).length;

  if (selectedCount === 0) {
    return 'unchecked';
  }
  if (selectedCount === fileIds.length) {
    return 'checked';
  }
  return 'indeterminate';
}

export const useBulkSelection = create<BulkSelectionState>((set) => ({
  selectedFiles: new Set<string>(),
  selectMode: false,

  setSelectMode: (selectMode: boolean) => {
    // Leaving select mode drops the current selection
    set(selectMode ? { selectMode } : { selectMode, selectedFiles: new Set<string>() });
  },

  toggleFile: (fileId: string) => {
    set((state) => {
      const newSet = new Set(state.selectedFiles);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return { selectedFiles: newSet };
    });
  },

  selectFiles: (fileIds: string[]) => {
    set((state) => {
      const newSet = new Set(state.selectedFiles);
      for (const fileId of fileIds) {
        newSet.add(fileId);
      }
      return { selectedFiles: newSet };
    });
  },

  deselectFiles: (fileIds: string[]) => {
    set((state) => {
      const newSet = new Set(state.selectedFiles);
      for (const fileId of fileIds) {
        newSet.delete(fileId);
      }
      return { selectedFiles: newSet };
    });
  },

  clearSelection: () => {
    set({ selectedFiles: new Set<string>(), selectMode: false });
  },
}));
