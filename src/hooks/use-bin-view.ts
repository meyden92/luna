import { create } from 'zustand';

type BinViewData = {
  id: string;
  title: string | null;
  content: string;
  language: string | null;
  isPublic: boolean;
  createdAt: Date;
};

interface BinViewStore {
  isOpen: boolean;
  bin: BinViewData | undefined;
  onOpen: (bin: BinViewData) => void;
  onClose: () => void;
}

export const useBinView = create<BinViewStore>((set) => ({
  isOpen: false,
  bin: undefined,
  onOpen: (bin: BinViewData) =>
    set({
      bin,
      isOpen: true,
    }),
  onClose: () => set({ isOpen: false, bin: undefined }),
}));
