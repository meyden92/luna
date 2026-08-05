import { type InfiniteData, infiniteQueryOptions, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { deleteGalleryFiles } from '@/libs/gallery-cache';
import { type GalleryFilters, queryKeys } from '@/libs/query-keys';
import { getGallery } from '@/server/fns/files';
import type { GalleryFile } from '@/types/project';
import { useGalleryStore } from './stores/gallery-store';

interface GalleryResData {
  files: GalleryFile[];
  nextCursor: string | null;
}

export const galleryQueryOptions = (filters?: GalleryFilters) =>
  infiniteQueryOptions({
    queryKey: queryKeys.gallery.list(filters),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<GalleryResData> => {
      // getGallery accepts the GalleryFilters shape directly; the filter
      // semantics live server-side.
      const resData = await getGallery({ data: { limit: 30, cursor: pageParam ?? undefined, ...filters } });
      return resData as GalleryResData;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 1000 * 60, // 1 minute - prevents unnecessary refetches on mount
    gcTime: 1000 * 60 * 5, // 5 minutes - keep data in cache
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

export const useGallery = (filters?: GalleryFilters, enabled = true) => {
  const queryClient = useQueryClient();

  const { data, fetchNextPage, hasNextPage, refetch, isError, isFetching, isFetchingNextPage } = useInfiniteQuery({
    ...galleryQueryOptions(filters),
    enabled,
  });

  const deleteFileFromCache = useCallback(
    (fileIds: string[]) => {
      if (fileIds.length === 0) return;

      const { currentIndex, setCurrentIndex } = useGalleryStore.getState();
      const fileIdSet = new Set(fileIds);
      const activeGallery = queryClient.getQueryData<InfiniteData<GalleryResData>>(queryKeys.gallery.list(filters));
      const activeFiles = activeGallery?.pages?.flatMap((page) => page.files) ?? [];
      const deletedBeforeCurrentIndex = activeFiles.slice(0, currentIndex).filter((file) => fileIdSet.has(file.id)).length;
      const totalFilesAfterDeletion = activeFiles.filter((file) => !fileIdSet.has(file.id)).length;

      deleteGalleryFiles(queryClient, fileIdSet);

      // Shift the index by deletions ahead of it, then clamp into the new range —
      // computed once so the two adjustments can't fight over the final value.
      const shifted = Math.max(0, currentIndex - deletedBeforeCurrentIndex);
      const finalIndex = totalFilesAfterDeletion > 0 ? Math.min(shifted, totalFilesAfterDeletion - 1) : 0;
      if (finalIndex !== currentIndex) {
        setCurrentIndex(finalIndex);
      }
    },
    [queryClient, filters],
  );

  const filteredFiles = useMemo(() => {
    return data?.pages.flatMap((page) => page.files) || [];
  }, [data]);

  return useMemo(
    () => ({
      filteredFiles,
      fetchNextPage,
      hasNextPage,
      deleteFileFromCache,
      refetch,
      isError,
      isFetching,
      isFetchingNextPage,
    }),
    [filteredFiles, fetchNextPage, hasNextPage, deleteFileFromCache, refetch, isError, isFetching, isFetchingNextPage],
  );
};
