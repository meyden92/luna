import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { type GalleryFilters, queryKeys } from '@/libs/query-keys';
import type { GalleryFile } from '@/types/project';

export interface GalleryPage {
  files: GalleryFile[];
  nextCursor: string | null;
}

const DEFAULT_PAGE_SIZE = 30;

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function getFileTags(file: GalleryFile): string[] {
  return (file.tags ?? '')
    .split(',')
    .map((tag) => normalizeText(tag))
    .filter(Boolean);
}

function matchesDateRange(file: GalleryFile, filters?: GalleryFilters): boolean {
  const createdAt = file.createdAt ? new Date(file.createdAt).getTime() : 0;
  if (filters?.startDate && createdAt < new Date(filters.startDate).getTime()) {
    return false;
  }
  if (filters?.endDate && createdAt > new Date(filters.endDate).getTime()) {
    return false;
  }
  return true;
}

function matchesSearch(file: GalleryFile, filters?: GalleryFilters): boolean {
  if (!filters?.search) {
    return true;
  }

  const query = normalizeText(filters.search);
  const title = normalizeText(file.title);
  const tags = normalizeText(file.tags);

  return title.includes(query) || tags.includes(query);
}

function matchesFileType(file: GalleryFile, filters?: GalleryFilters): boolean {
  if (!filters?.fileType) {
    return true;
  }

  const isImage = file.contentType.startsWith('image/');
  const isVideo = file.contentType.startsWith('video/');
  const typeMatches = filters.fileType === 'image' ? isImage : filters.fileType === 'video' ? isVideo : !isImage && !isVideo;

  return filters.fileTypeOperator === 'is not' ? !typeMatches : typeMatches;
}

function matchesFolder(file: GalleryFile, filters?: GalleryFilters): boolean {
  if (filters?.folderId && filters.folderId !== 'null') {
    return file.folderId === filters.folderId;
  }

  if (filters?.excludeFoldered) {
    return file.folderId === null;
  }

  return true;
}

function matchesPrivacy(file: GalleryFile, filters?: GalleryFilters): boolean {
  if (!filters?.privacy) {
    return true;
  }

  return filters.privacy === 'private' ? file.private : !file.private;
}

function matchesTags(file: GalleryFile, filters?: GalleryFilters): boolean {
  if (!filters?.tags?.length) {
    return true;
  }

  const fileTags = getFileTags(file);
  const filterTags = filters.tags.map((tag) => normalizeText(tag)).filter(Boolean);
  const hasAnyMatch = filterTags.some((tag) => fileTags.some((fileTag) => fileTag.includes(tag)));

  return filters.tagsOperator === 'is not' || filters.tagsOperator === 'none of' ? !hasAnyMatch : hasAnyMatch;
}

function matchesGalleryFilters(file: GalleryFile, filters?: GalleryFilters): boolean {
  return (
    matchesDateRange(file, filters) &&
    matchesSearch(file, filters) &&
    matchesFileType(file, filters) &&
    matchesFolder(file, filters) &&
    matchesPrivacy(file, filters) &&
    matchesTags(file, filters)
  );
}

function sortGalleryFiles(files: GalleryFile[], filters?: GalleryFilters): GalleryFile[] {
  const sortBy = filters?.sortBy ?? 'createdAt';
  const sortDirection = filters?.sortDirection ?? 'desc';
  const multiplier = sortDirection === 'asc' ? 1 : -1;

  return [...files].sort((left, right) => {
    let comparison = 0;

    switch (sortBy) {
      case 'name':
        comparison = (left.title ?? '').localeCompare(right.title ?? '', undefined, { sensitivity: 'base' });
        break;
      case 'size':
        comparison = left.size - right.size;
        break;
      case 'updatedAt': {
        const leftUpdated = new Date((left as GalleryFile & { updatedAt?: string | Date | null }).updatedAt ?? left.createdAt).getTime();
        const rightUpdated = new Date((right as GalleryFile & { updatedAt?: string | Date | null }).updatedAt ?? right.createdAt).getTime();
        comparison = leftUpdated - rightUpdated;
        break;
      }
      default: {
        const leftCreated = new Date(left.createdAt).getTime();
        const rightCreated = new Date(right.createdAt).getTime();
        comparison = leftCreated - rightCreated;
        break;
      }
    }

    if (comparison !== 0) {
      return comparison * multiplier;
    }

    return (left.id ?? '').localeCompare(right.id ?? '') * multiplier;
  });
}

function repaginateGalleryData(oldData: InfiniteData<GalleryPage>, files: GalleryFile[]): InfiniteData<GalleryPage> {
  const pageSizes = oldData.pages.map((page, index) => {
    const isLastPage = index === oldData.pages.length - 1;
    const baseSize = page.files.length || DEFAULT_PAGE_SIZE;
    return isLastPage ? baseSize + 1 : baseSize;
  });

  let offset = 0;

  return {
    ...oldData,
    pages: oldData.pages.map((page, index) => {
      const pageSize = pageSizes[index] ?? DEFAULT_PAGE_SIZE;
      const nextFiles = files.slice(offset, offset + pageSize);
      offset += pageSize;

      return {
        ...page,
        files: nextFiles,
      };
    }),
  };
}

// Applies `mapFile` to every file across all cached gallery queries
// (every filter variant), preserving referential identity for untouched
// pages so React re-renders stay minimal.
export function patchGalleryFiles(queryClient: QueryClient, mapFile: (file: GalleryFile) => GalleryFile) {
  queryClient.setQueriesData<InfiniteData<GalleryPage>>({ queryKey: queryKeys.gallery.all }, (oldData) => {
    if (!oldData?.pages) return oldData;

    let changed = false;
    const pages = oldData.pages.map((page) => {
      let pageChanged = false;
      const files = page.files.map((file) => {
        const next = mapFile(file);
        if (next !== file) pageChanged = true;
        return next;
      });
      if (!pageChanged) return page;
      changed = true;
      return { ...page, files };
    });

    return changed ? { ...oldData, pages } : oldData;
  });
}

export function insertGalleryFile(queryClient: QueryClient, newFile: GalleryFile) {
  const galleryCaches = queryClient.getQueriesData<InfiniteData<GalleryPage>>({ queryKey: queryKeys.gallery.all });

  galleryCaches.forEach(([queryKey, cachedData]) => {
    if (!cachedData?.pages?.length) {
      return;
    }

    const filters = (queryKey[1] as GalleryFilters | undefined) ?? undefined;
    if (!matchesGalleryFilters(newFile, filters)) {
      return;
    }

    queryClient.setQueryData<InfiniteData<GalleryPage>>(queryKey, (oldData) => {
      if (!oldData?.pages?.length) {
        return oldData;
      }

      const dedupedFiles = oldData.pages.flatMap((page) => page.files).filter((file) => file.id !== newFile.id);
      const sortedFiles = sortGalleryFiles([...dedupedFiles, newFile], filters);

      return repaginateGalleryData(oldData, sortedFiles);
    });
  });
}

export function deleteGalleryFiles(queryClient: QueryClient, fileIds: ReadonlySet<string>) {
  queryClient.setQueriesData<InfiniteData<GalleryPage>>({ queryKey: queryKeys.gallery.all }, (oldData) => {
    if (!oldData?.pages) return oldData;

    let changed = false;
    const pages = oldData.pages.map((page) => {
      const files = page.files.filter((file) => !fileIds.has(file.id));
      if (files.length === page.files.length) return page;
      changed = true;
      return { ...page, files };
    });

    return changed ? { ...oldData, pages } : oldData;
  });
}
