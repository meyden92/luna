import { Check, Download, Link2, MoreVertical, Play, Trash2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getSelectedCount, getSelectedFileIds, useBulkSelection } from '@/hooks/stores/use-bulk-selection';
import { useClipboard } from '@/hooks/use-copy-to-clipboard';
import useEdit from '@/hooks/use-edit';
import { cn, formatSize, getCDNImage, getFileIcon } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';
import { FileContextMenu } from './FileContextMenu';
import MoveToFolderMenu from './MoveToFolderMenu';

/** Custom MIME type carrying gallery file ids through native drag-and-drop. */
export const FILE_DRAG_TYPE = 'application/x-luna-files';

// --- Helper functions ---

const mimeToExtension: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'image/gif': 'GIF',
  'image/webp': 'WEBP',
  'image/svg+xml': 'SVG',
  'image/bmp': 'BMP',
  'audio/mpeg': 'MP3',
  'audio/mp3': 'MP3',
  'audio/wav': 'WAV',
  'audio/ogg': 'OGG',
  'audio/m4a': 'M4A',
  'audio/aac': 'AAC',
  'audio/flac': 'FLAC',
  'audio/wma': 'WMA',
  'video/mp4': 'MP4',
  'video/webm': 'WEBM',
  'video/quicktime': 'MOV',
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/zip': 'ZIP',
  'application/x-tar': 'TAR',
  'application/gzip': 'GZ',
  'application/json': 'JSON',
  'text/plain': 'TXT',
  'text/html': 'HTML',
  'text/css': 'CSS',
  'text/javascript': 'JS',
  'application/javascript': 'JS',
};

function getFileExtension(contentType: string, title?: string | null): string {
  if (mimeToExtension[contentType]) return mimeToExtension[contentType];
  // Fallback: extract from filename
  if (title) {
    const dot = title.lastIndexOf('.');
    if (dot !== -1) return title.slice(dot + 1).toUpperCase();
  }
  // Fallback: extract from MIME subtype
  const sub = contentType.split('/')[1];
  if (sub) return sub.toUpperCase().slice(0, 5);
  return 'FILE';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const previewableFileTypes = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
];

function canPreviewFile(filetype: string): boolean {
  return previewableFileTypes.includes(filetype);
}

interface GalleryEntryProps {
  file: GalleryFile;
  userId: string;
  handleDeleteAction: (fileId: string) => void;
  onPreview: (fileId: string) => void;
  showFolderBadge?: boolean;
  /** Justified-rows mode: explicit pixel box. Omitted in grid mode (4:3 cells). */
  width?: number;
  height?: number;
  // Bulk editing props - use count to avoid array re-renders
  selectedCount?: number;
  onClearSelection?: () => void;
  onDeleteMultiple?: (fileIds: string[]) => void;
}

function GalleryEntry({
  file,
  userId,
  handleDeleteAction,
  onPreview,
  showFolderBadge = false,
  width,
  height,
  selectedCount = 0,
  onClearSelection,
  onDeleteMultiple,
}: GalleryEntryProps) {
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const onOpen = useEdit((state) => state.onOpen);
  const setImage = useEdit((state) => state.setFile);
  const clipboard = useClipboard({ timeout: 2000 });

  const isSelected = useBulkSelection((state) => state.selectedFiles.has(file.id));
  const selectMode = useBulkSelection((state) => state.selectMode);
  const toggleFile = useBulkSelection((state) => state.toggleFile);

  const hasMultipleSelected = selectedCount > 0;
  const selectedFileIds = hasMultipleSelected ? getSelectedFileIds(useBulkSelection.getState().selectedFiles) : [];
  const canPreview = canPreviewFile(file.contentType);

  const handleBulkDelete = useCallback(() => {
    onDeleteMultiple?.(getSelectedFileIds(useBulkSelection.getState().selectedFiles));
  }, [onDeleteMultiple]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (selectMode || e.metaKey || e.ctrlKey) {
        toggleFile(file.id);
        return;
      }
      onPreview(file.id);
    },
    [selectMode, toggleFile, file.id, onPreview],
  );

  const handleDoubleClick = useCallback(() => {
    onOpen(file);
  }, [file, onOpen]);

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        const directUrl = getCDNImage(`/${userId}/${file.url}`);
        const link = document.createElement('a');
        link.href = directUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    [file.url, userId],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // Dragging a selected card carries the whole selection; otherwise just this file
      const selected = useBulkSelection.getState();
      const ids =
        selected.selectedFiles.has(file.id) && getSelectedCount(selected.selectedFiles) > 1
          ? getSelectedFileIds(selected.selectedFiles)
          : [file.id];
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(FILE_DRAG_TYPE, JSON.stringify(ids));
    },
    [file.id],
  );

  useEffect(() => {
    if (!clipboard.copied) {
      return;
    }
    toast('Copied Image URL to clipboard', {
      duration: 2000,
      position: 'top-center',
    });
  }, [clipboard.copied]);

  const FileIcon = getFileIcon(file.contentType);
  const isOpen = isContextOpen || isDropdownOpen;
  const ext = getFileExtension(file.contentType, file.title);
  const isVideo = file.contentType.startsWith('video/');
  const duration = file.metadata?.duration ? formatDuration(file.metadata.duration) : null;

  const metaSubline = [ext, formatSize(file.size)].join(' · ');

  const dropdownMenu = (
    <DropdownMenu
      open={isDropdownOpen}
      onOpenChange={setIsDropdownOpen}
    >
      <DropdownMenuTrigger
        className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-luna-line bg-luna-bg/85 text-luna-ink-2 backdrop-blur-[6px] transition-colors hover:border-luna-accent hover:bg-luna-bg hover:text-luna-accent-2"
        aria-label="File options"
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bulk editing controls - show ONLY bulk options when files are selected */}
        {hasMultipleSelected ? (
          <>
            <DropdownMenuItem
              className="truncate text-sm font-medium"
              disabled
            >
              {`${selectedCount} ${selectedCount === 1 ? 'file' : 'files'} selected`}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onClearSelection}>
              <X className="mr-2 h-4 w-4" />
              Clear selection
            </DropdownMenuItem>
            <MoveToFolderMenu
              fileIds={selectedFileIds}
              asDropdown
              onClose={() => useBulkSelection.getState().clearSelection()}
            />
            <DropdownMenuItem onClick={handleBulkDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              {`Delete ${selectedCount} ${selectedCount === 1 ? 'File' : 'Files'}`}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            {/* Single file options - only show when no bulk selection */}
            <DropdownMenuItem
              className="truncate text-sm"
              disabled
            >
              {file.title}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => clipboard.copy(`${window.location.origin}/view/${file.id}`)}>Copy URL</DropdownMenuItem>
            <DropdownMenuItem onClick={() => clipboard.copy(getCDNImage(`/${userId}/${file.url}`))}>Copy Direct URL</DropdownMenuItem>
            <DropdownMenuItem>
              <a
                href={`/api/download?url=${encodeURIComponent(getCDNImage(`/${userId}/${file.url}`))}`}
                download={file.title}
              >
                Download
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <MoveToFolderMenu
              fileIds={[file.id]}
              asDropdown
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleDeleteAction(file.id)}>Delete</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setImage(file);
                onOpen(file);
              }}
            >
              Edit
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <FileContextMenu
      file={file}
      userId={userId}
      handleDeleteAction={handleDeleteAction}
      selectedCount={selectedCount}
      onClearSelection={onClearSelection}
      onDeleteMultiple={onDeleteMultiple}
      onContextMenuOpenChange={setIsContextOpen}
    >
      <figure
        className={cn(
          'group/card relative m-0 flex-none cursor-pointer overflow-hidden rounded-[10px] border border-luna-line bg-luna-bg-3',
          'outline-2 -outline-offset-2 outline-transparent transition-[box-shadow,transform,outline-color] duration-150',
          'hover:z-[2] hover:-translate-y-px hover:shadow-[var(--luna-shadow-md)]',
          width === undefined && 'aspect-[4/3]',
          isSelected && 'outline-luna-accent',
          isOpen && 'z-[2] shadow-[var(--luna-shadow-md)]',
        )}
        style={width !== undefined ? { width, height } : undefined}
        role="button"
        tabIndex={0}
        aria-label={file.title?.trim() || 'Untitled file'}
        draggable
        onDragStart={handleDragStart}
        onMouseDown={handleMiddleClick}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (selectMode) toggleFile(file.id);
            else onPreview(file.id);
          }
        }}
      >
        <div className="absolute inset-0">
          {canPreview ? (
            <img
              alt={file.title || 'untitled'}
              className="h-full w-full object-cover"
              loading="lazy"
              draggable={false}
              src={getCDNImage(`/${userId}/${file.url}`)}
            />
          ) : (
            <div className="luna-ghost-hatch flex h-full w-full flex-col items-center justify-center gap-2 bg-luna-bg-2 text-luna-ink-3">
              <FileIcon className="h-[22px] w-[22px]" />
              <span className="font-mono text-sm tracking-[0.05em] text-luna-ink-2">.{ext.toLowerCase()}</span>
              {duration && <span className="font-mono text-[10px] text-luna-ink-4">{duration}</span>}
            </div>
          )}

          {/* hover shade */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 transition-opacity duration-150',
              'group-hover/card:opacity-100',
              (isSelected || isOpen) && 'opacity-100',
            )}
          />

          {/* select check */}
          <button
            type="button"
            title="Select"
            aria-label={`Select ${file.title?.trim() || 'Untitled file'}`}
            aria-pressed={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              toggleFile(file.id);
            }}
            className={cn(
              'absolute left-2 top-2 z-[3] flex h-[22px] w-[22px] scale-[0.85] items-center justify-center rounded-full border border-luna-line-2 bg-luna-bg/85 text-transparent opacity-0 transition-all duration-150',
              'hover:text-luna-ink-3 group-hover/card:scale-100 group-hover/card:opacity-100',
              (selectMode || isSelected) && 'scale-100 opacity-100',
              isSelected && 'border-luna-accent bg-luna-accent text-[oklch(0.15_0.03_162)]',
            )}
          >
            <Check
              className="h-3 w-3"
              strokeWidth={2.6}
            />
          </button>

          {/* quick actions */}
          <div
            className={cn(
              'absolute right-2 top-2 z-[3] flex -translate-y-[3px] gap-[5px] opacity-0 transition-all duration-150',
              'group-hover/card:translate-y-0 group-hover/card:opacity-100',
              isOpen && 'translate-y-0 opacity-100',
            )}
          >
            <button
              type="button"
              title="Copy share link"
              onClick={(e) => {
                e.stopPropagation();
                clipboard.copy(`${window.location.origin}/view/${file.id}`);
              }}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-luna-line bg-luna-bg/85 text-luna-ink-2 backdrop-blur-[6px] transition-colors hover:border-luna-accent hover:bg-luna-bg hover:text-luna-accent-2"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
            <a
              title="Download"
              href={`/api/download?url=${encodeURIComponent(getCDNImage(`/${userId}/${file.url}`))}`}
              download={file.title}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-luna-line bg-luna-bg/85 text-luna-ink-2 backdrop-blur-[6px] transition-colors hover:border-luna-accent hover:bg-luna-bg hover:text-luna-accent-2"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            {dropdownMenu}
          </div>

          {/* video badge */}
          {isVideo && (
            <span className="absolute bottom-2 right-2 z-[2] flex items-center gap-1 rounded-full bg-black/55 px-2 py-[3px] font-mono text-[10px] text-white backdrop-blur-[4px] transition-opacity group-hover/card:opacity-0">
              <Play className="h-[11px] w-[11px] fill-current" />
              {duration}
            </span>
          )}

          {/* hover meta */}
          <figcaption
            className={cn(
              'pointer-events-none absolute inset-x-2.5 bottom-2 z-[2] flex translate-y-1 flex-col gap-px opacity-0 transition-all duration-150',
              'group-hover/card:translate-y-0 group-hover/card:opacity-100',
            )}
          >
            <span className="truncate font-mono text-[10.5px] text-white">{file.title || 'Untitled'}</span>
            <span className="flex items-center gap-1.5 font-mono text-[9.5px] text-white/72">
              {metaSubline}
              {showFolderBadge && file.folder && (
                <span className="flex min-w-0 items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: file.folder.color || '#6b7280' }}
                  />
                  <span className="truncate">{file.folder.name}</span>
                </span>
              )}
            </span>
          </figcaption>
        </div>
      </figure>
    </FileContextMenu>
  );
}

// Memoized version with custom comparison - use selectedCount (number) not array
const MemoizedGalleryEntry = memo(GalleryEntry, (prevProps, nextProps) => {
  return (
    prevProps.file.id === nextProps.file.id &&
    prevProps.file.title === nextProps.file.title &&
    prevProps.file.url === nextProps.file.url &&
    prevProps.file.folderId === nextProps.file.folderId &&
    prevProps.file.folder?.name === nextProps.file.folder?.name &&
    prevProps.file.folder?.color === nextProps.file.folder?.color &&
    prevProps.userId === nextProps.userId &&
    prevProps.showFolderBadge === nextProps.showFolderBadge &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.selectedCount === nextProps.selectedCount &&
    prevProps.handleDeleteAction === nextProps.handleDeleteAction &&
    prevProps.onPreview === nextProps.onPreview &&
    prevProps.onClearSelection === nextProps.onClearSelection &&
    prevProps.onDeleteMultiple === nextProps.onDeleteMultiple
  );
});

export default MemoizedGalleryEntry;
export { GalleryEntry };
