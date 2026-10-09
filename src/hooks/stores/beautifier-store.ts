import { create } from 'zustand';
import {
  type BeautifierConfig,
  type BeautifierConfigUpdate,
  type BeautifierSourceFile,
  beautifierConfigSchema,
  DEFAULT_BEAUTIFIER_CONFIG,
} from '@/schemas/beautifier-schema';

interface BeautifierSavedFile {
  id: string;
  url: string;
  title: string;
}

interface BeautifierStore {
  source: BeautifierSourceFile | null;
  config: BeautifierConfig;
  isSaving: boolean;
  savedFile: BeautifierSavedFile | null;
  setSource: (source: BeautifierSourceFile) => void;
  updateConfig: (updates: BeautifierConfigUpdate) => void;
  resetConfig: () => void;
  setSaving: (isSaving: boolean) => void;
  setSavedFile: (file: BeautifierSavedFile | null) => void;
}

export const useBeautifierStore = create<BeautifierStore>((set) => ({
  source: null,
  config: DEFAULT_BEAUTIFIER_CONFIG,
  isSaving: false,
  savedFile: null,

  setSource: (source) =>
    set((state) => {
      const isSameSource = source.id === state.source?.id;
      return {
        source,
        config: isSameSource ? state.config : DEFAULT_BEAUTIFIER_CONFIG,
        savedFile: isSameSource ? state.savedFile : null,
      };
    }),

  updateConfig: (updates) =>
    set((state) => {
      // Validate the merged config, not `updates` alone: parsing a partial schema fills in every field's default,
      // which would reset the settings the update does not mention.
      const nextResult = beautifierConfigSchema.safeParse({ ...state.config, ...updates });
      if (!nextResult.success) return state;

      return { config: nextResult.data };
    }),

  resetConfig: () => set({ config: DEFAULT_BEAUTIFIER_CONFIG, savedFile: null }),
  setSaving: (isSaving) => set({ isSaving }),
  setSavedFile: (savedFile) => set({ savedFile }),
}));
