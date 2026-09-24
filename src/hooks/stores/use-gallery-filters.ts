import { create } from 'zustand';
import type { GalleryFilters, GallerySortField } from '@/libs/query-keys';

/**
 * Which files are in view: every file, the ones in no folder at all, or one
 * folder's. `'*'` and `null` are distinct answers, which is why the scope is not
 * just a nullable folder id.
 */
export type FilesScope = '*' | null | (string & {});

/** The toolbar's type filter. "Documents" means none of the other three. */
export type FilesType = 'all' | 'image' | 'video' | 'audio' | 'file';

/**
 * The toolbar offers four orderings rather than a field and a direction,
 * because "Largest first" is one decision, not two.
 */
export type FilesSort = 'newest' | 'oldest' | 'name' | 'largest';

const SORT_TO_QUERY: Record<FilesSort, { sortBy: GallerySortField; sortDirection: 'asc' | 'desc' }> = {
  newest: { sortBy: 'createdAt', sortDirection: 'desc' },
  oldest: { sortBy: 'createdAt', sortDirection: 'asc' },
  name: { sortBy: 'name', sortDirection: 'asc' },
  largest: { sortBy: 'size', sortDirection: 'desc' },
};

interface GalleryFiltersState {
  scope: FilesScope;
  query: string;
  type: FilesType;
  sort: FilesSort;
  setScope: (scope: FilesScope) => void;
  setQuery: (query: string) => void;
  setType: (type: FilesType) => void;
  setSort: (sort: FilesSort) => void;
  /** Back to every file, no search and no type filter. The empty state's button. */
  clear: () => void;
}

/**
 * The Files screen's scope and filters.
 *
 * Every change applies immediately — there is no pending state to commit,
 * because the toolbar's four controls replaced a filter bar where a filter was
 * built up and then applied.
 */
export const useGalleryFilters = create<GalleryFiltersState>((set) => ({
  scope: '*',
  query: '',
  type: 'all',
  sort: 'newest',
  setScope: (scope) => set({ scope }),
  setQuery: (query) => set({ query }),
  setType: (type) => set({ type }),
  setSort: (sort) => set({ sort }),
  clear: () => set({ scope: '*', query: '', type: 'all' }),
}));

/** The scope and filters as the gallery query expects them. */
export function toGalleryFilters(state: Pick<GalleryFiltersState, 'scope' | 'query' | 'type' | 'sort'>): GalleryFilters {
  return {
    search: state.query.trim() || undefined,
    fileType: state.type === 'all' ? undefined : state.type,
    folderId: typeof state.scope === 'string' && state.scope !== '*' ? state.scope : undefined,
    // "Not in a folder" is the null scope; '*' places no folder condition at all.
    excludeFoldered: state.scope === null ? true : undefined,
    ...SORT_TO_QUERY[state.sort],
  };
}
