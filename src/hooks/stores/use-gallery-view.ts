import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GalleryLayout = 'rows' | 'grid';

/** 1 (largest thumbnails) … 5 (densest). The View options slider's range. */
export type GallerySize = 1 | 2 | 3 | 4 | 5;

interface GalleryViewState {
  layout: GalleryLayout;
  size: GallerySize;
  setLayout: (layout: GalleryLayout) => void;
  setSize: (size: number) => void;
}

/**
 * Thumbnail sizes per step, from the design. Rows are laid out to a target
 * height and grid cells to a minimum width, so the two scales differ.
 */
const ROW_HEIGHTS = [120, 150, 180, 220, 270] as const;
const GRID_CELL_MIN_WIDTHS = [130, 160, 200, 250, 310] as const;

export function sizeMetrics(size: GallerySize) {
  return {
    rowHeight: ROW_HEIGHTS[size - 1] ?? 180,
    gridCellMinWidth: GRID_CELL_MIN_WIDTHS[size - 1] ?? 200,
  };
}

function clampSize(size: number): GallerySize {
  return Math.min(5, Math.max(1, Math.round(size))) as GallerySize;
}

/**
 * How Files is laid out. Persisted, because it is a preference about the owner's
 * screen rather than a property of what they are looking at — unlike the scope
 * and filters, which reset.
 */
export const useGalleryView = create<GalleryViewState>()(
  persist(
    (set) => ({
      layout: 'rows',
      size: 3,
      setLayout: (layout) => set({ layout }),
      setSize: (size) => set({ size: clampSize(size) }),
    }),
    {
      name: 'gallery-view',
      // Reading localStorage during SSR would make the server and client
      // disagree, so Files calls `persist.rehydrate()` on mount instead.
      skipHydration: true,
      // A stored value from an earlier scale (density ran 1–10) has to be pulled
      // back into range rather than laying the gallery out at size 9.
      onRehydrateStorage: () => (state) => state?.setSize(state.size),
    },
  ),
);
