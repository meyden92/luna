import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Upload } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { type UploadPrivacy, type UploadQueueItem, UploadSheet } from '@/components/uploader/UploadSheet';
import { getUploadValidationError, UploadError, uploadFile } from '@/components/uploader/upload-transport';
import { useFolders } from '@/contexts/FoldersContext';
import { type UploadSheetApi, UploadSheetContext } from '@/contexts/upload-sheet';
import { useCallbackRef } from '@/hooks/use-callback-ref';
import { useEventListener } from '@/hooks/use-event-listener';
import { insertGalleryFile } from '@/libs/gallery-cache';
import { queryKeys } from '@/libs/query-keys';
import { startViewTransition } from '@/libs/view-transition';
import type { GalleryFile } from '@/types/project';
import styles from './UploadSheetProvider.module.css';

/** Where uploaded files show up, and so where a finished batch takes you. */
const FILES_PATH = '/dashboard';

/** A drag carrying files, as opposed to one carrying selected text or a link. */
function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function makeQueueItem(file: File): UploadQueueItem {
  return {
    id: crypto.randomUUID(),
    file,
    progress: 0,
    // Only images get a thumbnail; everything else falls back to a type icon.
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
  };
}

function revokePreviews(items: readonly UploadQueueItem[]): void {
  for (const item of items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
}

/**
 * The one upload controller for the whole app.
 *
 * Uploading is a global action: the nav Upload button, a file dropped anywhere
 * on the window and a ⌘V paste all open this sheet and add to this queue. The
 * window listeners live here rather than on Files so they work on Generate,
 * Snippets and Settings too, and the sheet is rendered here so there is exactly
 * one of it.
 *
 * Takes no props: it is mounted once in the app shell (inside `FoldersProvider`,
 * whose folder list the Folder select needs on every page).
 */
export function UploadSheetProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { folders } = useFolders();

  const [isOpen, setIsOpen] = React.useState(false);
  const [queue, setQueue] = React.useState<readonly UploadQueueItem[]>([]);
  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [privacy, setPrivacy] = React.useState<UploadPrivacy>('public');
  const [copyLink, setCopyLink] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  // The folder Files currently has open, remembered so the next upload defaults
  // to it. A ref because Files writes it from an effect and nothing re-renders
  // on it — it is only read when the sheet opens.
  const defaultFolderId = React.useRef<string | null>(null);
  // Mirrors `isOpen` for `open()`, which has to tell a fresh open (reset the
  // folder to the default) from a second drop onto an already-open sheet (keep
  // whatever the user picked).
  const isOpenRef = React.useRef(false);
  // dragenter/dragleave fire for every element the pointer crosses, so the veil
  // follows a depth count rather than the last event.
  const dragDepth = React.useRef(0);

  const setOpen = (next: boolean) => {
    isOpenRef.current = next;
    setIsOpen(next);
  };

  const addFiles = (files: readonly File[]) => {
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const error = getUploadValidationError(file);
      if (error) rejected.push(`${file.name} — ${error}`);
      else accepted.push(file);
    }

    const [firstRejected] = rejected;
    if (firstRejected) {
      toast.error(
        rejected.length === 1 ? `Can’t upload ${firstRejected}` : `Can’t upload ${rejected.length} files. First: ${firstRejected}`,
      );
    }
    if (accepted.length === 0) return;

    setQueue((current) => [...current, ...accepted.map(makeQueueItem)]);
  };

  const open = (files?: readonly File[]) => {
    if (!isOpenRef.current) setFolderId(defaultFolderId.current);
    setOpen(true);
    if (files && files.length > 0) addFiles(files);
  };

  const removeFile = (id: string) => {
    const item = queue.find((queued) => queued.id === id);
    if (item) revokePreviews([item]);
    setQueue((current) => current.filter((queued) => queued.id !== id));
  };

  /** Empty the queue and close. Never called while a batch is on the wire. */
  const close = () => {
    revokePreviews(queue);
    setQueue([]);
    setOpen(false);
  };

  // Both listeners deliberately sit on the window: a drop or a paste counts
  // wherever it lands, including on pages that know nothing about uploading.
  useEventListener('dragenter', (event) => {
    if (!dragHasFiles(event)) return;
    dragDepth.current += 1;
    setDragging(true);
  });

  useEventListener('dragleave', (event) => {
    if (!dragHasFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  });

  useEventListener('dragover', (event) => {
    // Without this the drop never fires and the browser opens the file instead.
    if (dragHasFiles(event)) event.preventDefault();
  });

  useEventListener('drop', (event) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy) return;

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) open(files);
  });

  useEventListener('paste', (event) => {
    if (busy) return;
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) open(files);
  });

  /** Show the new files in Files, travelling there first if we are elsewhere. */
  const revealInFiles = async (uploaded: readonly GalleryFile[]) => {
    if (!location.pathname.startsWith(FILES_PATH)) {
      await navigate({ to: FILES_PATH });
    }

    await startViewTransition(() => {
      for (const file of uploaded) insertGalleryFile(queryClient, file);
      queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all, refetchType: 'none' });
    }, 'gallery');
  };

  /** True only when the link really reached the clipboard, so the toast can't lie. */
  const copyFileLink = async (file: GalleryFile): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/view/${file.id}`);
      return true;
    } catch {
      return false;
    }
  };

  const startUpload = async () => {
    if (busy || queue.length === 0) return;
    const batch = queue;
    const options = { folderId, private: privacy === 'private' };
    setBusy(true);

    const results = await Promise.all(
      batch.map(async (item) => {
        const reportProgress = (loaded: number, total: number) => {
          const safeTotal = Math.max(total, item.file.size, 1);
          const progress = Math.min(100, (Math.min(Math.max(loaded, 0), safeTotal) / safeTotal) * 100);
          setQueue((current) => current.map((queued) => (queued.id === item.id ? { ...queued, progress } : queued)));
        };

        try {
          const file = await uploadFile(item.file, options, reportProgress);
          if (!file) throw new Error('The server answered with an unexpected upload response');
          reportProgress(item.file.size, item.file.size);
          return { item, file };
        } catch (error) {
          return {
            item,
            error: error instanceof Error ? error.message : 'Upload failed',
            code: error instanceof UploadError ? error.code : undefined,
          };
        }
      }),
    );

    const uploaded = results.flatMap((result) => (result.file ? [result.file] : []));
    const failed = results.filter((result) => !result.file);
    setBusy(false);

    // A folder count changed, so the sidebar's numbers have to be re-read.
    if (options.folderId && uploaded.length > 0) {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    }

    if (failed.length === 0) {
      close();
    } else {
      // Keep the failures on screen so they can be tried again; the ones that
      // made it are about to appear in Files instead.
      const failedIds = new Set(failed.map((result) => result.item.id));
      revokePreviews(batch.filter((item) => !failedIds.has(item.id)));
      setQueue((current) => current.filter((item) => failedIds.has(item.id)).map((item) => ({ ...item, progress: 0 })));

      /*
       * Once the file itself has passed the checks in `getUploadValidationError`,
       * the only thing left for the route to reject as invalid is the folder —
       * deleted in another tab since the Select was filled. Drop the dead choice
       * and refresh the list so pressing Upload again can actually work.
       */
      if (options.folderId && failed.some((result) => result.code === 'VALIDATION_FAILED')) {
        setFolderId(null);
        queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
        toast.error('That folder no longer exists. Pick another and try again.');
      } else {
        const [first] = failed;
        toast.error(
          failed.length === 1 ? `Upload failed. ${first?.error}` : `${failed.length} of ${batch.length} uploads failed. ${first?.error}`,
        );
      }
    }

    if (uploaded.length === 0) return;

    // Copied before navigating, while the click that started the upload is as
    // recent as it can be — the clipboard is fussier the longer we wait.
    const copiedFile = failed.length === 0 && copyLink && uploaded.length === 1 ? uploaded[0] : undefined;
    const copied = copiedFile ? await copyFileLink(copiedFile) : false;

    await revealInFiles(uploaded);

    if (failed.length === 0) {
      toast.success(copied ? 'Uploaded · link copied' : `Uploaded ${uploaded.length} ${uploaded.length === 1 ? 'file' : 'files'}`);
    }
  };

  // The API's identity has to hold across renders: Files calls
  // `setDefaultFolderId` from an effect, which would otherwise loop.
  const openStable = useCallbackRef(open);
  const api = React.useMemo<UploadSheetApi>(
    () => ({
      open: openStable,
      setDefaultFolderId: (next) => {
        defaultFolderId.current = next;
      },
    }),
    [openStable],
  );

  return (
    <UploadSheetContext.Provider value={api}>
      {children}

      <UploadSheet
        open={isOpen}
        queue={queue}
        busy={busy}
        folders={folders}
        folderId={folderId}
        privacy={privacy}
        copyLink={copyLink}
        onOpenChange={(next) => {
          // A batch on the wire cannot be abandoned, so the sheet stays put.
          if (busy) return;
          if (next) setOpen(true);
          else close();
        }}
        onAddFiles={addFiles}
        onRemoveFile={removeFile}
        onFolderChange={setFolderId}
        onPrivacyChange={setPrivacy}
        onCopyLinkChange={setCopyLink}
        onUpload={startUpload}
      />

      {/* Only while the sheet is shut: with it open the drop zone already says
          where the files are going. */}
      {dragging && !isOpen && (
        <div
          className={styles.veil}
          aria-hidden="true"
        >
          <div className={styles.veilCard}>
            <Upload className={styles.veilIcon} />
            Drop to upload
          </div>
        </div>
      )}
    </UploadSheetContext.Provider>
  );
}
