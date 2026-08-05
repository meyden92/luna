import { create } from 'zustand';

type BinEditData = {
  id: string;
  title: string | null;
  content: string;
  language: string | null;
  isPublic: boolean;
};

interface BinEditStore {
  isOpen: boolean;
  bin: BinEditData | undefined;
  setBin: (bin: BinEditData) => void;
  onOpen: (bin: BinEditData) => void;
  onClose: () => void;
}

export const useBinEdit = create<BinEditStore>((set) => ({
  isOpen: false,
  bin: undefined,
  setBin: (bin: BinEditData) => set({ bin }),
  onOpen: (bin: BinEditData) =>
    set({
      bin,
      isOpen: true,
    }),
  onClose: () => set({ isOpen: false, bin: undefined }),
}));
