import { create } from 'zustand';
import type { GalleryFilters, GallerySortField } from '@/libs/query-keys';

interface GalleryFiltersStore {
  filters: GalleryFilters;
  // Pending values
  searchValue: string;
  startDate: string;
  endDate: string;
  fileType: string;
  fileTypeOperator: 'is' | 'is not';
  folderId: string | null;
  privacy: string;
  tags: string[];
  tagsOperator: 'is' | 'is not' | 'one of' | 'none of';
  sortBy: GallerySortField;
  sortDirection: 'asc' | 'desc';
  // Setters
  setSearchValue: (value: string) => void;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  setFileType: (value: string, operator?: 'is' | 'is not') => void;
  setFolderId: (value: string | null) => void;
  setPrivacy: (value: string) => void;
  setTags: (value: string[], operator?: 'is' | 'is not' | 'one of' | 'none of') => void;
  setTagsOperator: (operator: 'is' | 'is not' | 'one of' | 'none of') => void;
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  setSort: (sortBy: GallerySortField, sortDirection: 'asc' | 'desc') => void;
  // Actions
  applyFilters: () => void;
  clearFilters: () => void;
  removeFilter: (key: keyof GalleryFilters) => void;
}

export const useGalleryFilters = create<GalleryFiltersStore>((set, get) => ({
  filters: {},
  searchValue: '',
  startDate: '',
  endDate: '',
  fileType: 'all',
  fileTypeOperator: 'is',
  folderId: null,
  privacy: 'all',
  tags: [],
  tagsOperator: 'one of',
  sortBy: 'createdAt',
  sortDirection: 'desc',

  setSearchValue: (value) => set({ searchValue: value }),
  setStartDate: (value) => set({ startDate: value }),
  setEndDate: (value) => set({ endDate: value }),
  setFileType: (value, operator = 'is') => set({ fileType: value, fileTypeOperator: operator }),
  setFolderId: (value) => set({ folderId: value }),
  setPrivacy: (value) => set({ privacy: value }),
  setTags: (value, operator) => set({ tags: value, ...(operator ? { tagsOperator: operator } : {}) }),
  setTagsOperator: (operator) => set({ tagsOperator: operator }),
  addTag: (tag) => {
    const { tags } = get();
    if (!tags.includes(tag)) {
      set({ tags: [...tags, tag] });
    }
  },
  removeTag: (tag) => {
    const { tags } = get();
    set({ tags: tags.filter((t) => t !== tag) });
  },
  setSort: (sortBy, sortDirection) => set({ sortBy, sortDirection }),

  applyFilters: () => {
    const { searchValue, startDate, endDate, fileType, fileTypeOperator, folderId, privacy, tags, tagsOperator, sortBy, sortDirection } =
      get();
    set({
      filters: {
        search: searchValue.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        fileType: fileType !== 'all' ? (fileType as GalleryFilters['fileType']) : undefined,
        fileTypeOperator: fileType !== 'all' ? fileTypeOperator : undefined,
        folderId: folderId || undefined,
        privacy: privacy !== 'all' ? (privacy as GalleryFilters['privacy']) : undefined,
        tags: tags.length > 0 ? tags : undefined,
        tagsOperator: tags.length > 0 ? tagsOperator : undefined,
        sortBy,
        sortDirection,
      },
    });
  },

  clearFilters: () => {
    set({
      searchValue: '',
      startDate: '',
      endDate: '',
      fileType: 'all',
      fileTypeOperator: 'is',
      folderId: null,
      privacy: 'all',
      tags: [],
      tagsOperator: 'one of',
      sortBy: 'createdAt',
      sortDirection: 'desc',
      filters: {},
    });
  },

  removeFilter: (key) => {
    const state = get();
    const updates: Partial<GalleryFiltersStore> = {};

    switch (key) {
      case 'search':
        updates.searchValue = '';
        break;
      case 'startDate':
        updates.startDate = '';
        break;
      case 'endDate':
        updates.endDate = '';
        break;
      case 'fileType':
        updates.fileType = 'all';
        updates.fileTypeOperator = 'is';
        break;
      case 'folderId':
        updates.folderId = null;
        break;
      case 'privacy':
        updates.privacy = 'all';
        break;
      case 'tags':
        updates.tags = [];
        updates.tagsOperator = 'one of';
        break;
    }

    const newFilters = { ...state.filters };
    delete newFilters[key];
    if (key === 'fileType') {
      delete newFilters.fileTypeOperator;
    }
    if (key === 'tags') {
      delete newFilters.tagsOperator;
    }

    set({ ...updates, filters: newFilters });
  },
}));
