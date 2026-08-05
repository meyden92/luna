import { create } from 'zustand';

import type { GalleryFile } from '@/types/project';

interface EditStore {
  isOpen: boolean;
  file: GalleryFile | undefined;
  setFile: (image: GalleryFile) => void;
  onOpen: (image: GalleryFile) => void;
  onClose: () => void;
}

const useEdit = create<EditStore>((set) => ({
  isOpen: false,
  file: undefined,
  setFile: (image: GalleryFile) => set({ file: image }),
  onOpen: (image: GalleryFile) =>
    set({
      file: image,
      isOpen: true,
    }),
  onClose: () => set({ isOpen: false }),
}));

export default useEdit;
