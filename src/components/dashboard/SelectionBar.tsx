import { CheckSquare, Download, Folder, FolderOpen, Link2, Loader2, Trash2, X } from 'lucide-react';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFolders } from '@/contexts/FoldersContext';
import { useBulkSelection } from '@/hooks/stores/use-bulk-selection';
import { useClipboard } from '@/hooks/use-copy-to-clipboard';
import { useMoveFiles } from '@/hooks/use-move-files';
import { cn, getCDNImage } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';
import styles from './SelectionBar.module.css';

interface SelectionBarProps {
  files: GalleryFile[];
  userId: string;
  isDeleting: boolean;
  hasNextPage: boolean;
  onDeleteFiles: (fileIds: string[]) => void;
}

/** Floating action bar shown while files are selected (design "light table" selection bar). */
export function SelectionBar({ files, userId, isDeleting, hasNextPage, onDeleteFiles }: SelectionBarProps) {
  const selectedFiles = useBulkSelection((state) => state.selectedFiles);
  const selectFiles = useBulkSelection((state) => state.selectFiles);
  const clearSelection = useBulkSelection((state) => state.clearSelection);
  const { folders } = useFolders();
  const { moveFilesTo } = useMoveFiles();
  const clipboard = useClipboard({ timeout: 2000 });
  const [isPreparingDownload, setIsPreparingDownload] = useState(false);

  const count = selectedFiles.size;
  const loadedFileIds = useMemo(() => files.map((file) => file.id), [files]);
  const selectedLoadedCount = loadedFileIds.filter((id) => selectedFiles.has(id)).length;
  const hasUnselectedLoadedFiles = selectedLoadedCount < loadedFileIds.length;

  useEffect(() => {
    if (clipboard.copied) {
      toast(`${count} link${count === 1 ? '' : 's'} copied`, { duration: 2000 });
    }
  }, [clipboard.copied, count]);

  if (count === 0) return null;

  const ids = Array.from(selectedFiles);
  const selectAllLoaded = () => {
    startTransition(() => {
      selectFiles(loadedFileIds.filter((id) => !selectedFiles.has(id)));
    });
  };

  const copyLinks = () => {
    clipboard.copy(ids.map((id) => `${window.location.origin}/view/${id}`).join('\n'));
  };

  const downloadSelected = async () => {
    if (ids.length === 1) {
      const [id] = ids;
      const file = files.find((f) => f.id === id);
      if (!file) return;
      const link = document.createElement('a');
      link.href = `/api/download?url=${encodeURIComponent(getCDNImage(`/${userId}/${file.url}`))}`;
      link.download = file.title || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    setIsPreparingDownload(true);
    const toastId = toast.loading(`Preparing ${ids.length} files...`);
    try {
      const response = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `lunashare-${ids.length}-files.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success(`Prepared ${ids.length} files`, { id: toastId });
    } catch {
      toast.error('Could not prepare download', { id: toastId });
    } finally {
      setIsPreparingDownload(false);
    }
  };

  return (
    <div className={styles.bar}>
      <span className={styles.count}>
        <b className={styles.countValue}>{count}</b> selected
      </span>
      <button
        type="button"
        className={styles.button}
        onClick={selectAllLoaded}
        disabled={!hasUnselectedLoadedFiles}
        title={hasNextPage ? 'Select all loaded files in this view' : 'Select all files in this view'}
      >
        <CheckSquare className={styles.icon} /> Select all{hasNextPage ? ' loaded' : ''}
      </button>
      <span className={styles.divider} />

      <DropdownMenu>
        <DropdownMenuTrigger className={styles.button}>
          <Folder className={styles.icon} /> Move to
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className={styles.menuContent}
        >
          <DropdownMenuItem onClick={() => moveFilesTo(ids, null)}>
            <FolderOpen className={styles.menuIcon} />
            Root (All Files)
          </DropdownMenuItem>
          {folders.length > 0 && <DropdownMenuSeparator />}
          {folders.map((folder) => (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => moveFilesTo(ids, folder.id)}
            >
              <span
                className={styles.folderDot}
                style={{ backgroundColor: folder.color || '#6b7280' }}
              />
              <span className={styles.folderName}>{folder.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        className={styles.button}
        onClick={copyLinks}
      >
        <Link2 className={styles.icon} /> Copy links
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={downloadSelected}
        disabled={isPreparingDownload}
      >
        {isPreparingDownload ? <Loader2 className={styles.spinning} /> : <Download className={styles.icon} />}
        {isPreparingDownload ? 'Preparing...' : 'Download'}
      </button>
      <button
        type="button"
        className={cn(styles.button, styles.buttonDanger)}
        disabled={isDeleting}
        onClick={() => onDeleteFiles(ids)}
      >
        {isDeleting ? <Loader2 className={styles.spinning} /> : <Trash2 className={styles.icon} />}
        {isDeleting ? 'Deleting...' : 'Delete'}
      </button>

      <span className={styles.divider} />
      <button
        type="button"
        title="Clear selection"
        aria-label="Clear selection"
        onClick={clearSelection}
        className={styles.close}
      >
        <X className={styles.icon} />
      </button>
    </div>
  );
}
