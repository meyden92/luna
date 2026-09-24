import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Download, ExternalLink, FolderOpen, Lock, SearchX, Trash2, Unlock, Upload } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDeleteDialog } from '@/components/dashboard/ConfirmDeleteDialog';
import { FileCard } from '@/components/dashboard/FileCard';
import { FileGroups } from '@/components/dashboard/FileGroups';
import { FilesToolbar } from '@/components/dashboard/FilesToolbar';
import FolderSidebar from '@/components/dashboard/FolderSidebar';
import { GallerySkeleton } from '@/components/dashboard/GallerySkeleton';
import MoveToFolderMenu from '@/components/dashboard/MoveToFolderMenu';
import { Preview, type PreviewFile } from '@/components/dashboard/preview/Preview';
import { SelectionBar } from '@/components/dashboard/SelectionBar';
import { FormSharesListDialog } from '@/components/form-share/FormSharesListDialog';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useFolders } from '@/contexts/FoldersContext';
import { useUploadSheet } from '@/contexts/upload-sheet';
import { useBulkSelection } from '@/hooks/stores/use-bulk-selection';
import { toGalleryFilters, useGalleryFilters } from '@/hooks/stores/use-gallery-filters';
import { sizeMetrics, useGalleryView } from '@/hooks/stores/use-gallery-view';
import { useClipboard } from '@/hooks/use-copy-to-clipboard';
import { galleryQueryOptions, useGallery } from '@/hooks/use-gallery';
import { useMoveFiles } from '@/hooks/use-move-files';
import { deleteGalleryFiles, patchGalleryFiles } from '@/libs/gallery-cache';
import { copyImageToClipboard } from '@/libs/image-clipboard';
import { morphIntoPreview, morphOutOfPreview } from '@/libs/preview-morph';
import { queryKeys } from '@/libs/query-keys';
import { getCDNImage } from '@/libs/utils';
import { startViewTransition } from '@/libs/view-transition';
import { deleteFiles, getGalleryCount, setFilePrivacy } from '@/server/fns/files';
import type { GalleryFile } from '@/types/project';
import styles from './dashboard.module.css';

/** `?file=<id>` opens that file in the Preview, so a file can be linked to. */
const filesSearchSchema = z.object({ file: z.string().optional() });

export const Route = createFileRoute('/_dashboard/dashboard')({
  validateSearch: filesSearchSchema,
  head: () => ({ meta: [{ title: 'Files | LunaShare' }] }),
  loader: async ({ context }) => {
    // Newest first, no folder and no filter: the state the screen opens in.
    await context.queryClient.ensureInfiniteQueryData(
      galleryQueryOptions(toGalleryFilters({ scope: '*', query: '', type: 'all', sort: 'newest' })),
    );
  },
  component: FilesPage,
});

/** The scope's name, which is also the page title. */
function scopeTitle(scope: string | null, folders: readonly { id: string; name: string }[]): string {
  if (scope === '*') return 'All files';
  if (scope === null) return 'Not in a folder';
  return folders.find((folder) => folder.id === scope)?.name ?? 'Folder';
}

function FilesPage() {
  const queryClient = useQueryClient();
  const clipboard = useClipboard();
  const upload = useUploadSheet();
  const { moveFilesTo } = useMoveFiles();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const { file: linkedFileId } = Route.useSearch();
  const { folders } = useFolders();
  const ownerId = session?.user?.id ?? '';

  const { scope, query, type, sort, setQuery, setType, setSort, clear } = useGalleryFilters();
  const { layout, size, setLayout, setSize } = useGalleryView();
  const { selectedFiles, toggleFile, selectFiles, deselectFiles, clearSelection } = useBulkSelection();

  const [previewId, setPreviewId] = React.useState<string | null>(linkedFileId ?? null);
  const [confirmDeleteIds, setConfirmDeleteIds] = React.useState<string[] | null>(null);
  const [formSharesOpen, setFormSharesOpen] = React.useState(false);

  // The persisted layout and size are read on the client only, so the server and
  // the first client render agree (see use-gallery-view).
  React.useEffect(() => {
    void useGalleryView.persist.rehydrate();
  }, []);

  const filters = React.useMemo(() => toGalleryFilters({ scope, query, type, sort }), [scope, query, type, sort]);
  const { filteredFiles, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } = useGallery(filters);

  /*
   * The total, from the server. Counting the loaded pages instead is what made
   * the head read "30+" beside a sidebar total of 4256.
   */
  const { data: total } = useQuery({
    queryKey: queryKeys.gallery.count(filters),
    queryFn: () => getGalleryCount({ data: filters }),
    staleTime: 60 * 1000,
  });

  // Keep the upload sheet's default folder in step with where the owner is.
  React.useEffect(() => {
    upload.setDefaultFolderId(typeof scope === 'string' && scope !== '*' ? scope : null);
  }, [scope, upload]);

  // A selection only means anything within one scope, so changing scope drops it
  // — but arriving at one does not, or a linked file would clear on open.
  const lastScope = React.useRef(scope);
  React.useEffect(() => {
    if (lastScope.current === scope) return;
    lastScope.current = scope;
    clearSelection();
  }, [scope, clearSelection]);

  React.useEffect(() => {
    const clearOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedFiles.size > 0) clearSelection();
    };
    window.addEventListener('keydown', clearOnEscape);
    return () => window.removeEventListener('keydown', clearOnEscape);
  }, [selectedFiles.size, clearSelection]);

  const { mutate: removeFiles } = useMutation({
    mutationFn: (fileIds: string[]) => deleteFiles({ data: { fileIds } }),
    onSuccess: (_result, fileIds) => {
      startViewTransition(() => {
        deleteGalleryFiles(queryClient, new Set(fileIds));
      }, 'gallery');
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all, refetchType: 'none' });
      deselectFiles(fileIds);
      toast.success(fileIds.length === 1 ? 'File deleted' : `${fileIds.length} files deleted`);
    },
    onError: (error) => toast.error(error.message),
  });

  const { mutate: setVisibility } = useMutation({
    mutationFn: (input: { fileId: string; isPrivate: boolean }) => setFilePrivacy({ data: input }),
    onSuccess: (result) => {
      patchGalleryFiles(queryClient, (file) => (file.id === result.id ? { ...file, private: result.isPrivate } : file));
      toast.success(result.isPrivate ? 'Made private' : 'Made public');
    },
    onError: (error) => toast.error(error.message),
  });

  const linkFor = (fileId: string) => `${window.location.origin}/view/${fileId}`;
  const directUrlFor = (file: GalleryFile) => getCDNImage(`/${ownerId}/${file.url}`);

  const copyImage = async (file: GalleryFile) => {
    // A non-image has no image to put on the clipboard, so the link stands in.
    if (!file.contentType.startsWith('image/')) {
      clipboard.copy(linkFor(file.id));
      toast.success('Link copied');
      return;
    }
    try {
      await copyImageToClipboard(directUrlFor(file));
      toast.success('Image copied to clipboard');
    } catch {
      toast.error('Could not copy the image');
    }
  };

  const copyLink = (fileId: string) => {
    clipboard.copy(linkFor(fileId));
    toast.success('Link copied');
  };

  const openPreview = (fileId: string) => morphIntoPreview(fileId, () => setPreviewId(fileId));
  const closePreview = () => {
    const closing = previewId;
    if (!closing) return;
    morphOutOfPreview(closing, () => setPreviewId(null));
    // A file opened from a link leaves the param behind; closing should clear it.
    if (linkedFileId) navigate({ search: {}, replace: true });
  };

  /* Filters and sorts glide rather than cut, so cards keep their identity. */
  const withGalleryTransition = (update: () => void) => startViewTransition(update, 'gallery');

  const selectedIds = React.useMemo(() => [...selectedFiles], [selectedFiles]);
  const selecting = selectedFiles.size > 0;
  const { rowHeight, gridCellMinWidth } = sizeMetrics(size);
  const title = scopeTitle(scope, folders);

  const previewFiles = React.useMemo<PreviewFile[]>(
    () =>
      filteredFiles.map((file) => ({
        id: file.id,
        name: file.title ?? 'Untitled',
        size: file.size,
        mimeType: file.contentType,
        width: file.metadata?.width ?? null,
        height: file.metadata?.height ?? null,
        createdAt: file.createdAt,
        isPrivate: file.private,
        folderId: file.folderId,
        url: file.url,
        ownerId: file.ownerId,
      })),
    [filteredFiles],
  );

  const isFiltered = query.trim() !== '' || type !== 'all';
  const showEmpty = !isFetching && filteredFiles.length === 0;

  return (
    <div className={styles.root}>
      <FolderSidebar onFormSharesOpen={() => setFormSharesOpen(true)} />

      <div className={styles.main}>
        <header className={styles.head}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.count}>
            {total ?? filteredFiles.length} {(total ?? filteredFiles.length) === 1 ? 'file' : 'files'}
            {query.trim() !== '' && ` matching “${query.trim()}”`}
          </p>
        </header>

        <FilesToolbar
          query={query}
          onQueryChange={setQuery}
          type={type}
          onTypeChange={(next) => withGalleryTransition(() => setType(next))}
          sort={sort}
          onSortChange={(next) => withGalleryTransition(() => setSort(next))}
          layout={layout}
          onLayoutChange={(next) => withGalleryTransition(() => setLayout(next))}
          size={size}
          onSizeChange={setSize}
        />

        {showEmpty ? (
          <Empty className={styles.empty}>
            <EmptyHeader>
              <EmptyMedia variant="icon">{isFiltered ? <SearchX /> : <FolderOpen />}</EmptyMedia>
              <EmptyTitle>{isFiltered ? 'No files match' : 'This folder is empty'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered ? 'Try a different name or file type.' : 'Drag files onto this folder in the sidebar, or upload new ones.'}
              </EmptyDescription>
            </EmptyHeader>
            {isFiltered ? (
              <Button
                variant="outline"
                onClick={() => withGalleryTransition(clear)}
              >
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => upload.open()}>
                <Upload data-icon="inline-start" />
                Upload
              </Button>
            )}
          </Empty>
        ) : filteredFiles.length === 0 ? (
          <GallerySkeleton />
        ) : (
          <FileGroups
            files={filteredFiles}
            layout={layout}
            rowHeight={rowHeight}
            gridCellMinWidth={gridCellMinWidth}
            stickyHeaders
            selectedIds={selectedFiles}
            onSelectGroup={(ids, selectAll) => (selectAll ? selectFiles(ids) : deselectFiles(ids))}
            sentinel={
              hasNextPage ? (
                <LoadMore
                  onReach={fetchNextPage}
                  busy={isFetchingNextPage}
                />
              ) : null
            }
            renderCard={(file) => (
              <FileCard
                file={file}
                selected={selectedFiles.has(file.id)}
                selecting={selecting}
                iconOnlyActions={false}
                dragIds={selectedFiles.has(file.id) ? selectedIds : [file.id]}
                onOpen={() => openPreview(file.id)}
                onToggleSelect={() => toggleFile(file.id)}
                onCopyImage={() => void copyImage(file)}
                onCopyLink={() => copyLink(file.id)}
                menuItems={
                  <>
                    <DropdownMenuItem onClick={() => window.open(directUrlFor(file), '_blank', 'noopener')}>
                      <ExternalLink size={14} />
                      Open direct link
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      render={
                        <a
                          href={`/api/download?url=${encodeURIComponent(directUrlFor(file))}`}
                          download={file.title ?? undefined}
                        >
                          <Download size={14} />
                          Download
                        </a>
                      }
                    />
                    <MoveToFolderMenu
                      asDropdown
                      fileIds={[file.id]}
                    />
                    <DropdownMenuItem onClick={() => setVisibility({ fileId: file.id, isPrivate: !file.private })}>
                      {file.private ? <Unlock size={14} /> : <Lock size={14} />}
                      {file.private ? 'Make public' : 'Make private'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setConfirmDeleteIds([file.id])}>
                      <Trash2 size={14} />
                      Delete
                    </DropdownMenuItem>
                  </>
                }
              />
            )}
          />
        )}
      </div>

      {selecting && (
        <SelectionBar
          fileIds={selectedIds}
          onClear={clearSelection}
          onDelete={() => setConfirmDeleteIds(selectedIds)}
        />
      )}

      <Preview
        fileId={previewId}
        files={previewFiles}
        onClose={closePreview}
        onNavigate={setPreviewId}
        onDelete={(fileId) => setConfirmDeleteIds([fileId])}
        onMoveToFolder={(fileId, folderId) => moveFilesTo([fileId], folderId)}
        onVisibilityChange={(fileId, isPrivate) => setVisibility({ fileId, isPrivate })}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteIds !== null}
        onOpenChange={(open) => !open && setConfirmDeleteIds(null)}
        title={confirmDeleteIds && confirmDeleteIds.length > 1 ? `Delete ${confirmDeleteIds.length} files?` : 'Delete this file?'}
        description="Anyone with the link will lose access. This can’t be undone."
        onConfirm={() => {
          if (confirmDeleteIds) {
            // A deleted file cannot stay on the stage behind the dialog.
            if (previewId && confirmDeleteIds.includes(previewId)) setPreviewId(null);
            removeFiles(confirmDeleteIds);
          }
          setConfirmDeleteIds(null);
        }}
      />

      <FormSharesListDialog
        open={formSharesOpen}
        onOpenChange={setFormSharesOpen}
      />
    </div>
  );
}

/** Pulls the next page in as it scrolls into view, so there is no "load more" button. */
function LoadMore({ onReach, busy }: { onReach: () => void; busy: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onReach();
      },
      // Start fetching a screen early, so the gallery rarely runs dry.
      { rootMargin: '600px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [onReach]);

  return (
    <div
      ref={ref}
      className={styles.loadMore}
      aria-hidden={!busy}
    >
      {busy && <GallerySkeleton />}
    </div>
  );
}

export default FilesPage;
