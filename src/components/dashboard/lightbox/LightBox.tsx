import type { InfiniteData, InfiniteQueryObserverResult } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Download, Folder, FolderOpen, Link2, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFolders } from '@/contexts/FoldersContext';
import { useGalleryStore } from '@/hooks/stores/gallery-store';
import { useMoveFiles } from '@/hooks/use-move-files';
import { cn, formatSize, getCDNImage } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';
import { ImagePreloader } from './ImagePreloader';
import ImagePreviewSidebar from './ImagePreviewSidebar';
import styles from './LightBox.module.css';
import MainContent from './LightBoxMainContent';
import { LightboxPortal } from './LightboxPortal';

interface GalleryResData {
  files: GalleryFile[];
  nextCursor: string | null;
}

interface LightBoxProps {
  close: () => void;
  cachedData: GalleryFile[];
  userId: string;
  onLoadMore?: () => Promise<InfiniteQueryObserverResult<InfiniteData<GalleryResData, unknown>, Error>>;
  isLoading?: boolean;
  hasNextPage?: boolean;
  handleDeleteAction: (fileId: string) => void;
}

// Layout constants
const WHEEL_THROTTLE_MS = 120;
const PRELOAD_COUNT = 2;
const LOAD_MORE_THRESHOLD = 5;
const SWIPE_THRESHOLD_PX = 60;

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      Boolean(target.closest('[data-slot="dialog-content"], [data-slot="alert-dialog-content"]')))
  );
}

function isInteractiveTouchTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, a, input, textarea, select, video, audio, [role="button"]'));
}

export default function LightBox({ close, cachedData, userId, onLoadMore, isLoading, hasNextPage, handleDeleteAction }: LightBoxProps) {
  const currentIndex = useGalleryStore((state) => state.currentIndex);
  const setCurrentIndex = useGalleryStore((state) => state.setCurrentIndex);
  const currentFile = cachedData[currentIndex];
  const { folders } = useFolders();
  const { moveFilesTo } = useMoveFiles();

  // Refs for load more logic
  const isLoadingMore = useRef(false);
  const lastLoadIndex = useRef(-1);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Navigate to specific index
  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < cachedData.length) {
        setCurrentIndex(index);
      }
    },
    [cachedData.length, setCurrentIndex],
  );

  // Navigate to next/previous
  const goNext = useCallback(() => {
    if (currentIndex < cachedData.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, cachedData.length, setCurrentIndex]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex, setCurrentIndex]);

  const deleteCurrentFile = useCallback(() => {
    if (currentFile) handleDeleteAction(currentFile.id);
  }, [currentFile, handleDeleteAction]);

  const moveCurrentFileTo = useCallback(
    (folderId: string | null) => {
      if (currentFile) moveFilesTo([currentFile.id], folderId, { toggle: true });
    },
    [currentFile, moveFilesTo],
  );

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (isInteractiveTouchTarget(event.target)) {
      touchStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch || isInteractiveTouchTarget(event.target)) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

      if (deltaX < 0) {
        goNext();
      } else {
        goPrev();
      }
    },
    [goNext, goPrev],
  );

  // Load more when near end
  const handleNearEnd = useCallback(() => {
    if (
      onLoadMore &&
      hasNextPage &&
      !isLoading &&
      !isLoadingMore.current &&
      currentIndex >= cachedData.length - LOAD_MORE_THRESHOLD &&
      lastLoadIndex.current < currentIndex
    ) {
      isLoadingMore.current = true;
      lastLoadIndex.current = currentIndex;
      onLoadMore().finally(() => {
        isLoadingMore.current = false;
      });
    }
  }, [onLoadMore, hasNextPage, isLoading, currentIndex, cachedData.length]);

  // Check for load more on index change
  useEffect(() => {
    handleNearEnd();
  }, [handleNearEnd]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goPrev();
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case 'Delete':
        case 'Backspace':
          if (e.repeat) return;
          e.preventDefault();
          deleteCurrentFile();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, close, deleteCurrentFile]);

  // Mouse wheel navigation (throttled)
  useEffect(() => {
    let lastWheelTime = 0;

    const handleWheel = (e: WheelEvent) => {
      // Let the virtualized thumbnail rail scroll natively; only navigate over the main media area.
      if (e.target instanceof Element && e.target.closest('[data-lightbox-sidebar]')) return;
      if (e.target instanceof Element && e.target.closest('[data-lightbox-menu]')) return;
      if (e.ctrlKey) return;

      const now = Date.now();
      if (now - lastWheelTime < WHEEL_THROTTLE_MS) return;
      const canGoNext = e.deltaY > 0 && currentIndex < cachedData.length - 1;
      const canGoPrev = e.deltaY < 0 && currentIndex > 0;
      if (!canGoNext && !canGoPrev) return;

      lastWheelTime = now;
      e.preventDefault();
      if (canGoNext) {
        goNext();
      } else {
        goPrev();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [goNext, goPrev, currentIndex, cachedData.length]);

  // Lock body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Clamp an out-of-bounds index (e.g., after deletion shrinks the array) in an effect
  // rather than mutating the store during render.
  useEffect(() => {
    if (cachedData.length > 0 && currentIndex > cachedData.length - 1) {
      setCurrentIndex(cachedData.length - 1);
    }
  }, [currentIndex, cachedData.length, setCurrentIndex]);

  // Handle invalid index (e.g., after deletion). Render-only guard with no store mutation.
  if (!currentFile) {
    if (cachedData.length === 0) {
      return (
        <div className={styles.empty}>
          <p>No files available</p>
        </div>
      );
    }
    return null; // effect will clamp currentIndex and trigger a valid re-render
  }

  const ext = currentFile.contentType.split('/')[1]?.toUpperCase().slice(0, 5) || 'FILE';
  const metaLine = [
    ext,
    formatSize(currentFile.size),
    currentFile.createdAt ? format(new Date(currentFile.createdAt), 'yyyy-MM-dd HH:mm') : null,
    `${currentIndex + 1} / ${cachedData.length}${isLoading || isLoadingMore.current ? '…' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const copyShareLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/view/${currentFile.id}`).catch(() => {});
    toast('Share link copied', { duration: 2000 });
  };

  return (
    <LightboxPortal isOpen={!!currentFile}>
      {/* Image preloader for adjacent images */}
      <ImagePreloader
        files={cachedData}
        currentIndex={currentIndex}
        userId={userId}
        preloadCount={PRELOAD_COUNT}
      />

      <div className={styles.root}>
        {/* Top bar: filename, meta, actions */}
        <header className={styles.header}>
          <div className={styles.meta}>
            <span className={styles.title}>{currentFile.title || 'Untitled'}</span>
            <span className={styles.subtitle}>{metaLine}</span>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={cn(styles.button, styles.buttonDanger)}
              aria-label="Delete file"
              onClick={deleteCurrentFile}
            >
              <Trash2 className={styles.buttonIcon} /> <span className="hide-below-sm">Delete</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={styles.button}
                aria-label="Move file"
              >
                <Folder className={styles.buttonIcon} /> <span className="hide-below-sm">Move</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                data-lightbox-menu
                side="bottom"
                align="end"
                className={styles.menuContent}
              >
                <DropdownMenuItem onClick={() => moveCurrentFileTo(null)}>
                  <FolderOpen className={styles.menuIcon} />
                  Root (All Files)
                </DropdownMenuItem>
                {folders.length > 0 && <DropdownMenuSeparator />}
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    onClick={() => moveCurrentFileTo(folder.id)}
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
              aria-label="Copy share link"
              onClick={copyShareLink}
            >
              <Link2 className={styles.buttonIcon} /> <span className="hide-below-sm">Copy link</span>
            </button>
            <a
              className={styles.button}
              href={`/api/download?url=${encodeURIComponent(getCDNImage(`/${userId}/${currentFile.url}`))}`}
              download={currentFile.title}
              aria-label="Download file"
            >
              <Download className={styles.buttonIcon} /> <span className="hide-below-sm">Download</span>
            </a>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className={styles.close}
            >
              <X className={styles.closeIcon} />
            </button>
          </div>
        </header>

        {/* Main content area */}
        <div
          className={styles.stage}
          onTouchStartCapture={handleTouchStart}
          onTouchEndCapture={handleTouchEnd}
        >
          {/* Navigation buttons */}
          <button
            type="button"
            onClick={goPrev}
            disabled={currentIndex === 0}
            aria-label="Previous file"
            className={cn(styles.arrow, styles.arrowPrev)}
          >
            <ChevronLeft className={styles.arrowIcon} />
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex === cachedData.length - 1}
            aria-label="Next file"
            className={cn(styles.arrow, styles.arrowNext)}
          >
            <ChevronRight className={styles.arrowIcon} />
          </button>

          {/* Media content */}
          <MainContent
            file={currentFile}
            userId={userId}
            handleDeleteAction={handleDeleteAction}
          />
        </div>

        {/* Sidebar */}
        <div
          data-lightbox-sidebar
          className={styles.sidebar}
        >
          <ImagePreviewSidebar
            images={cachedData}
            currentIndex={currentIndex}
            onImageClick={goToIndex}
            userId={userId}
          />
        </div>
      </div>
    </LightboxPortal>
  );
}
