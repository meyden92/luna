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

interface SelectionBarProps {
  files: GalleryFile[];
  userId: string;
  isDeleting: boolean;
  hasNextPage: boolean;
  onDeleteFiles: (fileIds: string[]) => void;
}

const barButtonClass =
  'flex h-[30px] items-center gap-1.5 rounded-lg px-[11px] text-[12.5px] font-medium opacity-90 transition-all hover:bg-white/12 hover:opacity-100 dark:hover:bg-white/7';

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
    <div
      className={cn(
        'fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-[14px] py-2 pl-4 pr-2.5',
        'bg-luna-ink text-luna-bg shadow-[var(--luna-shadow-lg)]',
        'dark:border dark:border-luna-line-2 dark:bg-luna-bg-3 dark:text-luna-ink',
        'animate-in fade-in slide-in-from-bottom-2 duration-200',
      )}
    >
      <span className="mr-1.5 text-[13px] opacity-90">
        <b className="font-semibold">{count}</b> selected
      </span>
      <button
        type="button"
        className={barButtonClass}
        onClick={selectAllLoaded}
        disabled={!hasUnselectedLoadedFiles}
        title={hasNextPage ? 'Select all loaded files in this view' : 'Select all files in this view'}
      >
        <CheckSquare className="h-3.5 w-3.5" /> Select all{hasNextPage ? ' loaded' : ''}
      </button>
      <span className="mx-1.5 h-[18px] w-px bg-current opacity-20" />

      <DropdownMenu>
        <DropdownMenuTrigger className={barButtonClass}>
          <Folder className="h-3.5 w-3.5" /> Move to
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-44"
        >
          <DropdownMenuItem onClick={() => moveFilesTo(ids, null)}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Root (All Files)
          </DropdownMenuItem>
          {folders.length > 0 && <DropdownMenuSeparator />}
          {folders.map((folder) => (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => moveFilesTo(ids, folder.id)}
            >
              <span
                className="mr-2 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: folder.color || '#6b7280' }}
              />
              <span className="truncate">{folder.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        className={barButtonClass}
        onClick={copyLinks}
      >
        <Link2 className="h-3.5 w-3.5" /> Copy links
      </button>
      <button
        type="button"
        className={barButtonClass}
        onClick={downloadSelected}
        disabled={isPreparingDownload}
      >
        {isPreparingDownload ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {isPreparingDownload ? 'Preparing...' : 'Download'}
      </button>
      <button
        type="button"
        className={cn(barButtonClass, 'hover:text-[#FF9C92] disabled:pointer-events-none disabled:opacity-50')}
        disabled={isDeleting}
        onClick={() => onDeleteFiles(ids)}
      >
        {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {isDeleting ? 'Deleting...' : 'Delete'}
      </button>

      <span className="mx-1.5 h-[18px] w-px bg-current opacity-20" />
      <button
        type="button"
        title="Clear selection"
        aria-label="Clear selection"
        onClick={clearSelection}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg opacity-70 transition-all hover:bg-white/12 hover:opacity-100 dark:hover:bg-white/7"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
