import type H5AudioPlayer from 'react-h5-audio-player';
import { create } from 'zustand';

interface GalleryStoreState {
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  audioRef: H5AudioPlayer | null;
  setAudioRef: (ref: H5AudioPlayer | null) => void;
}

export const useGalleryStore = create<GalleryStoreState>((set) => ({
  currentIndex: 0,
  setCurrentIndex: (index) => set({ currentIndex: index }),
  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  audioRef: null,
  setAudioRef: (ref) => set({ audioRef: ref }),
}));
