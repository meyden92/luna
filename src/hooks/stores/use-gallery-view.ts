import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GalleryLayout = 'rows' | 'grid';

interface GalleryViewState {
  layout: GalleryLayout;
  /** 1 (largest cards) … 10 (densest) */
  density: number;
  setLayout: (layout: GalleryLayout) => void;
  setDensity: (density: number) => void;
}

/** Density → sizing curve lifted from the design prototype (d7 ≈ 187px rows). */
export function densityMetrics(density: number) {
  return {
    targetRowHeight: Math.round(348 - density * 23),
    gridCardMin: Math.round(330 - density * 21),
    gap: density >= 8 ? 8 : density >= 5 ? 10 : 14,
  };
}

export const useGalleryView = create<GalleryViewState>()(
  persist(
    (set) => ({
      layout: 'rows',
      density: 7,
      setLayout: (layout) => set({ layout }),
      setDensity: (density) => set({ density: Math.min(10, Math.max(1, Math.round(density))) }),
    }),
    { name: 'gallery-view', skipHydration: true },
  ),
);
