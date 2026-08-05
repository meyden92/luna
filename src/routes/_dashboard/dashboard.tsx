import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  Check,
  FileIcon,
  FilmIcon,
  FolderIcon,
  ImageIcon,
  LayoutGrid,
  LockIcon,
  Rows3,
  SlidersHorizontal,
  TagIcon,
  UnlockIcon,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import LightBox from '@/components/dashboard/lightbox/LightBox';
import { LightboxErrorBoundary } from '@/components/dashboard/lightbox/LightboxErrorBoundary';
import { SelectionBar } from '@/components/dashboard/SelectionBar';
import VirtualizedGallery from '@/components/dashboard/VirtualizedGallery';
import { Button } from '@/components/ui/button';
import {
  DynamicFilterBar,
  type FilterBarState,
  type FilterDefinition,
  OPERATORS,
  type SorterDefinition,
  type SortState,
} from '@/components/ui/dynamic-filterbar';
import EditModal from '@/components/ui/modal/EditModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { useUploadRef } from '@/contexts/UploadRefContext';
import { useGalleryStore } from '@/hooks/stores/gallery-store';
import { useBulkSelection } from '@/hooks/stores/use-bulk-selection';
import { useGalleryFilters } from '@/hooks/stores/use-gallery-filters';
import { useGalleryView } from '@/hooks/stores/use-gallery-view';
import { useConfirmation } from '@/hooks/use-confirmation';
import { useFilterOptions } from '@/hooks/use-filter-options';
import { galleryQueryOptions, useGallery } from '@/hooks/use-gallery';
import { useLightBox } from '@/hooks/use-lightbox';
import { userGallerySettingsQueryOptions, useUserGallerySettings } from '@/hooks/use-user-settings';
import type { GalleryPage } from '@/libs/gallery-cache';
import { type GalleryFilters, type GallerySortField, queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { deleteFiles } from '@/server/fns/files';

export const Route = createFileRoute('/_dashboard/dashboard')({
  head: () => ({ meta: [{ title: 'Dashboard | LunaShare' }] }),
  loader: async ({ context }) => {
    const userSettings = await context.queryClient.ensureQueryData(userGallerySettingsQueryOptions);
    await context.queryClient.ensureInfiniteQueryData(galleryQueryOptions(getDefaultDashboardFilters(userSettings)));
  },
  component: DashboardPage,
});

interface GalleryFilterContext {
  folders: { id: string; name: string; color: string | null }[];
  tags: string[];
}

type GallerySnapshot = readonly [readonly unknown[], InfiniteData<GalleryPage> | undefined];

const FILE_TYPE_OPTIONS = [
  { value: 'image', label: 'Image', icon: ImageIcon },
  { value: 'video', label: 'Video', icon: FilmIcon },
  { value: 'file', label: 'File', icon: FileIcon },
];

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', icon: UnlockIcon },
  { value: 'private', label: 'Private', icon: LockIcon },
];

function createGalleryFilters(ctx: GalleryFilterContext): FilterDefinition<GalleryFilterContext>[] {
  return [
    {
      key: 'fileType',
      label: 'Type',
      icon: FileIcon,
      operators: [OPERATORS.is, OPERATORS.is_not],
      options: FILE_TYPE_OPTIONS,
    },
    {
      key: 'privacy',
      label: 'Privacy',
      icon: LockIcon,
      operators: [OPERATORS.is],
      options: PRIVACY_OPTIONS,
    },
    {
      key: 'tags',
      label: 'Tags',
      icon: TagIcon,
      operators: [OPERATORS.one_of, OPERATORS.none_of],
      getOptions: (query) => {
        const lower = query.toLowerCase();
        return ctx.tags.filter((tag) => tag.toLowerCase().includes(lower)).map((tag) => ({ value: tag, label: tag }));
      },
    },
    {
      key: 'folderId',
      label: 'Folder',
      icon: FolderIcon,
      operators: [OPERATORS.is],
      getOptions: (query) => {
        const lower = query.toLowerCase();
        return ctx.folders
          .filter((folder) => folder.name.toLowerCase().includes(lower))
          .map((folder) => ({ value: folder.id, label: folder.name }));
      },
      getDisplayValue: (value, context) => {
        const folderId = Array.isArray(value) ? value[0] : value;
        const folder = context.folders.find((f) => f.id === folderId);
        return folder?.name ?? folderId ?? '';
      },
    },
  ];
}

function filterBarStateToGalleryStore(state: FilterBarState): Partial<GalleryFilters> {
  const result: Partial<GalleryFilters> = {
    search: state.search || undefined,
  };

  for (const filter of state.filters) {
    switch (filter.key) {
      case 'fileType':
        result.fileType = filter.values[0] as GalleryFilters['fileType'];
        result.fileTypeOperator = filter.operator.id === 'is_not' ? 'is not' : 'is';
        break;
      case 'privacy':
        result.privacy = filter.values[0] as GalleryFilters['privacy'];
        break;
      case 'tags':
        result.tags = filter.values;
        if (filter.operator.id === 'one_of') result.tagsOperator = 'one of';
        else if (filter.operator.id === 'none_of') result.tagsOperator = 'none of';
        break;
      case 'folderId':
        result.folderId = filter.values[0];
        break;
    }
  }

  return result;
}

function getDefaultDashboardFilters(userSettings: { showAllFilesIncludesFoldered: boolean }): GalleryFilters {
  return { excludeFoldered: userSettings.showAllFilesIncludesFoldered === false };
}

/** Rows ↔ Grid segmented toggle + density slider (design "tweaks" as toolbar controls). */
function ViewOptions() {
  const layout = useGalleryView((state) => state.layout);
  const density = useGalleryView((state) => state.density);
  const setLayout = useGalleryView((state) => state.setLayout);
  const setDensity = useGalleryView((state) => state.setDensity);

  const segmentClass = (active: boolean) =>
    cn(
      'flex h-7 w-8 items-center justify-center rounded-[7px] transition-colors',
      active ? 'bg-luna-bg text-luna-ink shadow-sm dark:bg-luna-bg-3' : 'text-luna-ink-4 hover:text-luna-ink',
    );

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-[9px] border border-luna-line bg-luna-bg-2 p-0.5">
        <button
          type="button"
          title="Justified rows"
          aria-label="Use justified rows layout"
          aria-pressed={layout === 'rows'}
          className={segmentClass(layout === 'rows')}
          onClick={() => setLayout('rows')}
        >
          <Rows3
            className="h-3.5 w-3.5"
            aria-hidden
          />
        </button>
        <button
          type="button"
          title="Grid"
          aria-label="Use grid layout"
          aria-pressed={layout === 'grid'}
          className={segmentClass(layout === 'grid')}
          onClick={() => setLayout('grid')}
        >
          <LayoutGrid
            className="h-3.5 w-3.5"
            aria-hidden
          />
        </button>
      </div>

      <Popover>
        <PopoverTrigger
          title="Density"
          aria-label="Thumbnail density"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-luna-line text-luna-ink-3 transition-colors hover:border-luna-line-2 hover:text-luna-ink"
        >
          <SlidersHorizontal
            className="h-3.5 w-3.5"
            aria-hidden
          />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-56 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-luna-ink">Density</span>
            <span className="font-mono text-[11px] text-luna-ink-4">{density}/10</span>
          </div>
          <Slider
            thumbAriaLabel="Thumbnail density"
            getThumbAriaValueText={(value) =>
              `${value} of 10, ${value <= 3 ? 'larger thumbnails' : value >= 8 ? 'smaller thumbnails' : 'medium thumbnails'}`
            }
            value={[density]}
            min={1}
            max={10}
            step={1}
            onValueChange={(value) => setDensity(Array.isArray(value) ? (value[0] ?? 7) : (value as number))}
          />
          <div className="mt-2 flex justify-between text-[10px] text-luna-ink-4">
            <span>Larger</span>
            <span>Smaller</span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DashboardPage() {
  const { session } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const filters = useGalleryFilters((state) => state.filters);
  const filterOptions = useFilterOptions();
  const { data: userSettings } = useUserGallerySettings();

  const [isDropZoneDragging, setIsDropZoneDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const uploadRef = useUploadRef();

  useEffect(() => {
    void useGalleryView.persist.rehydrate();
  }, []);

  const setSearchValue = useGalleryFilters((state) => state.setSearchValue);
  const setFileType = useGalleryFilters((state) => state.setFileType);
  const setPrivacy = useGalleryFilters((state) => state.setPrivacy);
  const setTags = useGalleryFilters((state) => state.setTags);
  const setFolderId = useGalleryFilters((state) => state.setFolderId);
  const setSort = useGalleryFilters((state) => state.setSort);
  const applyFiltersToStore = useGalleryFilters((state) => state.applyFilters);

  const selectMode = useBulkSelection((state) => state.selectMode);
  const setSelectMode = useBulkSelection((state) => state.setSelectMode);
  const clearSelection = useBulkSelection((state) => state.clearSelection);

  const filterContext: GalleryFilterContext = useMemo(
    () => ({ folders: filterOptions.folders, tags: filterOptions.tags }),
    [filterOptions.folders, filterOptions.tags],
  );

  const galleryFilters = useMemo(() => createGalleryFilters(filterContext), [filterContext]);
  const gallerySorters = useMemo<SorterDefinition[]>(
    () => [
      { key: 'createdAt', label: 'Created' },
      { key: 'updatedAt', label: 'Updated' },
      { key: 'name', label: 'Name' },
      { key: 'size', label: 'Size' },
    ],
    [],
  );

  const handleApply = useCallback(
    (state: FilterBarState) => {
      const storeState = filterBarStateToGalleryStore(state);

      setSearchValue(storeState.search || '');
      setFileType(storeState.fileType || 'all', storeState.fileTypeOperator || 'is');
      setPrivacy(storeState.privacy || 'all');
      setTags(storeState.tags || [], storeState.tagsOperator || 'one of');

      setFolderId(storeState.folderId || null);

      applyFiltersToStore();
    },
    [setSearchValue, setFileType, setPrivacy, setTags, setFolderId, applyFiltersToStore],
  );

  const handleSortChange = useCallback(
    (sort: SortState | null) => {
      if (sort) {
        setSort(sort.key as GallerySortField, sort.direction);
        applyFiltersToStore();
      }
    },
    [setSort, applyFiltersToStore],
  );

  // "/" focuses the filter bar search (design keyboard shortcut)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !/input|textarea|select/i.test(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-filterbar-input]')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return Boolean(filters.search || filters.fileType || filters.privacy || (filters.tags && filters.tags.length > 0));
  }, [filters]);

  const effectiveFilters = useMemo(() => {
    if (filters.folderId === null || filters.folderId === undefined) {
      if (hasActiveFilters) return filters;
      return getDefaultDashboardFilters(userSettings);
    }
    return filters;
  }, [filters, userSettings, hasActiveFilters]);

  const {
    filteredFiles: allGalleryFiles,
    fetchNextPage,
    hasNextPage,
    deleteFileFromCache,
    isFetching,
    isFetchingNextPage,
    isError,
    refetch,
  } = useGallery(effectiveFilters);

  const { confirm: confirmDelete, ConfirmationDialog } = useConfirmation<string | string[]>();

  const { mutate: executeDeleteFiles, isPending: isDeletingFiles } = useMutation({
    mutationFn: (data: { fileIds: string | string[] }) => deleteFiles({ data }) as Promise<{ id: string }[]>,
    onMutate: async ({ fileIds }) => {
      const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
      await queryClient.cancelQueries({ queryKey: queryKeys.gallery.all });

      const previousGalleries: GallerySnapshot[] = queryClient
        .getQueriesData<InfiniteData<GalleryPage>>({ queryKey: queryKeys.gallery.all })
        .map(([queryKey, data]) => [queryKey, data] as const);
      const previousSelection = new Set(useBulkSelection.getState().selectedFiles);
      const previousSelectMode = useBulkSelection.getState().selectMode;
      const previousCurrentIndex = useGalleryStore.getState().currentIndex;

      deleteFileFromCache(ids);
      clearSelection();

      return { previousGalleries, previousSelection, previousSelectMode, previousCurrentIndex };
    },
    onError: (error, _variables, context) => {
      context?.previousGalleries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      if (context) {
        useBulkSelection.setState({ selectedFiles: context.previousSelection, selectMode: context.previousSelectMode });
        useGalleryStore.getState().setCurrentIndex(context.previousCurrentIndex);
      }
      toast.error(`Something went wrong ${error.message || ''}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all, refetchType: 'none' });
    },
  });

  const lightBox = useLightBox(allGalleryFiles);

  const handleDeleteSingle = useCallback(
    (fileId: string) => {
      if (isDeletingFiles) return;
      confirmDelete({
        title: 'Delete file',
        description: 'Are you sure you want to delete this file?',
        data: fileId,
        onConfirm: (datafileId) => executeDeleteFiles({ fileIds: datafileId }),
      });
    },
    [confirmDelete, executeDeleteFiles, isDeletingFiles],
  );

  const handleDeleteMultiple = useCallback(
    (fileIds: string[]) => {
      if (isDeletingFiles) return;
      if (fileIds.length === 0) return;
      confirmDelete({
        title: 'Delete files',
        description: 'Are you sure you want to delete these files?',
        data: fileIds,
        onConfirm: (dataIds) => executeDeleteFiles({ fileIds: dataIds }),
      });
    },
    [confirmDelete, executeDeleteFiles, isDeletingFiles],
  );

  const handlePreviewClick = useCallback(
    (fileId: string) => {
      lightBox.open(fileId);
    },
    [lightBox],
  );

  const selectedFolderId = filters.folderId || null;
  const selectedScopeLabel = useMemo(() => {
    if (!selectedFolderId) return 'All Files';
    return filterContext.folders.find((folder) => folder.id === selectedFolderId)?.name ?? 'All Files';
  }, [filterContext.folders, selectedFolderId]);

  const handleLoadMore = useCallback(() => fetchNextPage(), [fetchNextPage]);

  const handleDropZoneDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDropZoneDragging(true);
  }, []);

  const handleDropZoneDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDropZoneDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDropZoneDragging(false);
  }, []);

  const handleDropZoneDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDropZoneDragging(false);
      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0 && uploadRef.current) {
        uploadRef.current.addFiles(Array.from(droppedFiles));
        uploadRef.current.openSheet();
      }
    },
    [uploadRef],
  );

  const userId = session?.user?.id;
  if (!userId) throw redirect({ to: '/login' });

  const fileCountLabel = `${allGalleryFiles.length}${hasNextPage ? '+' : ''} file${allGalleryFiles.length === 1 && !hasNextPage ? '' : 's'}`;

  return (
    <div className="pl-2 pr-2 pb-32 xl:pr-14">
      {/* page head */}
      <div className="luna-up mb-1 mt-2 flex items-baseline gap-4">
        <h1 className="m-0 whitespace-nowrap font-serif text-[44px] font-normal leading-none tracking-[-0.01em] text-luna-ink">
          {selectedScopeLabel}
        </h1>
        <span className="truncate font-mono text-xs text-luna-ink-4">
          {fileCountLabel}
          {filters.search ? ` matching “${filters.search}”` : ''}
        </span>
      </div>

      {/* toolbar */}
      <div className="luna-up luna-up-delay-1 sticky top-[4.625rem] z-30 -mx-1 flex flex-col gap-3 bg-luna-bg/88 px-1 py-2.5 backdrop-blur-[10px] xl:flex-row xl:items-center">
        <DynamicFilterBar
          filters={galleryFilters}
          sorters={gallerySorters}
          defaultSort={{ key: 'createdAt', direction: 'desc' }}
          context={filterContext}
          onApply={handleApply}
          onSortChange={handleSortChange}
          className="min-w-0 flex-1"
          syncToUrl={true}
          placeholder="Search files or filter by type, folder, privacy, tags..."
          translations={{
            clearAll: 'Clear all',
            search: 'Search',
            sortBy: 'Sort:',
            noResults: 'No suggestions found',
          }}
        />

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <button
            type="button"
            aria-pressed={selectMode}
            onClick={() => setSelectMode(!selectMode)}
            className={cn(
              'flex h-[30px] items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors',
              selectMode
                ? 'border-luna-accent bg-luna-accent-soft text-luna-accent-2 dark:text-luna-accent'
                : 'border-luna-line text-luna-ink-3 hover:border-luna-line-2 hover:text-luna-ink',
            )}
          >
            <Check className="h-[13px] w-[13px]" /> Select
          </button>

          <ViewOptions />

          <Button
            size="sm"
            className="h-[30px] rounded-[9px] px-3.5 font-semibold"
            onClick={() => uploadRef.current?.openSheet()}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
        </div>
      </div>

      {lightBox.isOpen && lightBox.selectedFile ? (
        <div className="fixed inset-y-0 z-40 size-full">
          <LightboxErrorBoundary onClose={lightBox.close}>
            <LightBox
              close={lightBox.close}
              cachedData={allGalleryFiles}
              userId={userId}
              onLoadMore={fetchNextPage}
              isLoading={isFetchingNextPage}
              hasNextPage={hasNextPage}
              handleDeleteAction={handleDeleteSingle}
            />
          </LightboxErrorBoundary>
        </div>
      ) : null}

      {/* gallery + upload drop zone */}
      <div
        className="luna-up luna-up-delay-2 relative min-h-[40vh]"
        onDragEnter={handleDropZoneDragEnter}
        onDragOver={handleDropZoneDragOver}
        onDragLeave={handleDropZoneDragLeave}
        onDrop={handleDropZoneDrop}
      >
        {isDropZoneDragging && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-[18px] border-2 border-dashed border-luna-accent bg-luna-bg/95">
            <div className="flex flex-col items-center gap-3 text-luna-accent-2 dark:text-luna-accent">
              <div className="rounded-full bg-luna-accent-tint p-4">
                <Upload className="h-8 w-8" />
              </div>
              <span className="font-serif text-[22px] text-luna-ink">Drop files to upload</span>
              <span className="text-[13px] text-luna-ink-4">Release anywhere inside the workspace</span>
            </div>
          </div>
        )}

        <VirtualizedGallery
          files={allGalleryFiles}
          userId={userId}
          selectedFolderId={selectedFolderId}
          scopeLabel={selectedScopeLabel}
          onPreviewClick={handlePreviewClick}
          handleDeleteSingle={handleDeleteSingle}
          handleDeleteMultiple={handleDeleteMultiple}
          clearSelection={clearSelection}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isLoading={isFetching && allGalleryFiles.length === 0}
          isError={isError && allGalleryFiles.length === 0}
          onRetry={refetch}
          onLoadMore={handleLoadMore}
        />
      </div>

      <SelectionBar
        files={allGalleryFiles}
        userId={userId}
        isDeleting={isDeletingFiles}
        hasNextPage={hasNextPage}
        onDeleteFiles={handleDeleteMultiple}
      />

      <EditModal />
      <ConfirmationDialog />
    </div>
  );
}
