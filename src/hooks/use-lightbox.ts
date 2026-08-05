import { useCallback, useMemo, useState } from 'react';
import { useGalleryStore } from '@/hooks/stores/gallery-store';
import type { GalleryFile } from '@/types/project';

export function useLightBox(allFiles: GalleryFile[]) {
  const setCurrentIndex = useGalleryStore((state) => state.setCurrentIndex);
  const setScrollToIndex = useGalleryStore((state) => state.setScrollToIndex);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<GalleryFile | null>(null);

  const open = useCallback(
    (id: string) => {
      const index = allFiles.findIndex((file) => file.id === id);
      if (index !== -1) {
        setCurrentIndex(index);
        const file = allFiles[index];
        if (file) {
          setSelectedFile(file);
          setIsOpen(true);
        }
      }
    },
    [allFiles, setCurrentIndex],
  );

  const close = useCallback(() => {
    // Get current index and trigger gallery scroll before closing
    const currentIndex = useGalleryStore.getState().currentIndex;
    setScrollToIndex(currentIndex);
    setSelectedFile(null);
    setIsOpen(false);
  }, [setScrollToIndex]);

  return useMemo(
    () => ({
      isOpen,
      open,
      close,
      selectedFile,
    }),
    [isOpen, open, close, selectedFile],
  );
}
