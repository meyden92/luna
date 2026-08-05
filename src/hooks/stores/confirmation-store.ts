import { create } from 'zustand';

type ConfirmationState = {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  openConfirmation: (options: { title: string; description: string; onConfirm: () => void }) => void;
  closeConfirmation: () => void;
};

export const useConfirmationStore = create<ConfirmationState>((set) => ({
  isOpen: false,
  title: '',
  description: '',
  onConfirm: () => {},
  openConfirmation: ({ title, description, onConfirm }) => set({ isOpen: true, title, description, onConfirm }),
  closeConfirmation: () => set({ isOpen: false }),
}));
