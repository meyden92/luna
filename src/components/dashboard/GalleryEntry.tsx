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
import { formatSize, getCDNImage, getFileIcon } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';
import { FileContextMenu } from './FileContextMenu';
import styles from './GalleryEntry.module.css';
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
        className={styles.actionButton}
        aria-label="File options"
        onClick={(e) => e.stopPropagation()}
      >
        <MoreVertical className={styles.actionIcon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={styles.menuContent}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bulk editing controls - show ONLY bulk options when files are selected */}
        {hasMultipleSelected ? (
          <>
            <DropdownMenuItem
              className={styles.menuItemCount}
              disabled
            >
              {`${selectedCount} ${selectedCount === 1 ? 'file' : 'files'} selected`}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onClearSelection}>
              <X className={styles.menuIcon} />
              Clear selection
            </DropdownMenuItem>
            <MoveToFolderMenu
              fileIds={selectedFileIds}
              asDropdown
              onClose={() => useBulkSelection.getState().clearSelection()}
            />
            <DropdownMenuItem onClick={handleBulkDelete}>
              <Trash2 className={styles.menuIcon} />
              {`Delete ${selectedCount} ${selectedCount === 1 ? 'File' : 'Files'}`}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            {/* Single file options - only show when no bulk selection */}
            <DropdownMenuItem
              className={styles.menuItemTitle}
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
        className={styles.card}
        data-shape={width === undefined ? 'aspect' : undefined}
        data-selected={isSelected || undefined}
        data-open={isOpen || undefined}
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
        <div className={styles.media}>
          {canPreview ? (
            <img
              alt={file.title || 'untitled'}
              className={styles.image}
              loading="lazy"
              draggable={false}
              src={getCDNImage(`/${userId}/${file.url}`)}
            />
          ) : (
            <div className={styles.placeholder}>
              <FileIcon className={styles.placeholderIcon} />
              <span className={styles.placeholderExt}>.{ext.toLowerCase()}</span>
              {duration && <span className={styles.placeholderDuration}>{duration}</span>}
            </div>
          )}

          {/* hover shade */}
          <div className={styles.shade} />

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
            className={styles.check}
            data-visible={selectMode || isSelected || undefined}
            data-selected={isSelected || undefined}
          >
            <Check
              className={styles.checkIcon}
              strokeWidth={2.6}
            />
          </button>

          {/* quick actions */}
          <div className={styles.actions}>
            <button
              type="button"
              title="Copy share link"
              onClick={(e) => {
                e.stopPropagation();
                clipboard.copy(`${window.location.origin}/view/${file.id}`);
              }}
              className={styles.actionButton}
            >
              <Link2 className={styles.actionIcon} />
            </button>
            <a
              title="Download"
              href={`/api/download?url=${encodeURIComponent(getCDNImage(`/${userId}/${file.url}`))}`}
              download={file.title}
              onClick={(e) => e.stopPropagation()}
              className={styles.actionButton}
            >
              <Download className={styles.actionIcon} />
            </a>
            {dropdownMenu}
          </div>

          {/* video badge */}
          {isVideo && (
            <span className={styles.videoBadge}>
              <Play className={styles.videoIcon} />
              {duration}
            </span>
          )}

          {/* hover meta */}
          <figcaption className={styles.caption}>
            <span className={styles.captionTitle}>{file.title || 'Untitled'}</span>
            <span className={styles.captionMeta}>
              {metaSubline}
              {showFolderBadge && file.folder && (
                <span className={styles.folderChip}>
                  <span
                    className={styles.folderDot}
                    style={{ backgroundColor: file.folder.color || '#6b7280' }}
                  />
                  <span className={styles.folderName}>{file.folder.name}</span>
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
