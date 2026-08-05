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
import { formatSize, getCDNImage } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';
import { ImagePreloader } from './ImagePreloader';
import ImagePreviewSidebar from './ImagePreviewSidebar';
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 text-white">
          <p className="text-lg">No files available</p>
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

  const lightboxButtonClass =
    'flex h-11 items-center gap-1.5 rounded-[9px] border border-[#F1F3EF]/22 px-3 text-[12.5px] font-medium text-[#F1F3EF] transition-all hover:border-[#F1F3EF]/40 hover:bg-[#F1F3EF]/10 sm:h-8 sm:px-[13px]';

  const arrowClass =
    'absolute top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#F1F3EF]/16 bg-[#F1F3EF]/8 text-[#F1F3EF] transition-all hover:bg-[#F1F3EF]/16 disabled:opacity-30';

  return (
    <LightboxPortal isOpen={!!currentFile}>
      {/* Image preloader for adjacent images */}
      <ImagePreloader
        files={cachedData}
        currentIndex={currentIndex}
        userId={userId}
        preloadCount={PRELOAD_COUNT}
      />

      <div className="fixed inset-0 grid h-[100dvh] grid-cols-1 grid-rows-[auto_1fr] bg-[rgba(8,12,10,0.93)] text-[#F1F3EF] backdrop-blur-[10px] md:grid-cols-[1fr_160px]">
        {/* Top bar: filename, meta, actions */}
        <header
          className="flex items-center justify-between gap-4 px-[22px] py-4"
          style={{ gridColumn: '1', gridRow: '1' }}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-mono text-[12.5px]">{currentFile.title || 'Untitled'}</span>
            <span className="font-mono text-[10.5px] text-[#F1F3EF]/55">{metaLine}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className={`${lightboxButtonClass} hover:border-[#FF9C92]/45 hover:bg-[#FF9C92]/10 hover:text-[#FFBBB4]`}
              aria-label="Delete file"
              onClick={deleteCurrentFile}
            >
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Delete</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={lightboxButtonClass}
                aria-label="Move file"
              >
                <Folder className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Move</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                data-lightbox-menu
                side="bottom"
                align="end"
                className="w-48"
              >
                <DropdownMenuItem onClick={() => moveCurrentFileTo(null)}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Root (All Files)
                </DropdownMenuItem>
                {folders.length > 0 && <DropdownMenuSeparator />}
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    onClick={() => moveCurrentFileTo(folder.id)}
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
              className={lightboxButtonClass}
              aria-label="Copy share link"
              onClick={copyShareLink}
            >
              <Link2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Copy link</span>
            </button>
            <a
              className={lightboxButtonClass}
              href={`/api/download?url=${encodeURIComponent(getCDNImage(`/${userId}/${currentFile.url}`))}`}
              download={currentFile.title}
              aria-label="Download file"
            >
              <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Download</span>
            </a>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-[9px] text-[#F1F3EF]/80 transition-all hover:bg-[#F1F3EF]/12 hover:text-white sm:h-8 sm:w-8"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Main content area */}
        <div
          className="relative flex items-center justify-center overflow-hidden"
          style={{ gridColumn: '1', gridRow: '2' }}
          onTouchStartCapture={handleTouchStart}
          onTouchEndCapture={handleTouchEnd}
        >
          {/* Navigation buttons */}
          <button
            type="button"
            onClick={goPrev}
            disabled={currentIndex === 0}
            aria-label="Previous file"
            className={`${arrowClass} left-5`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex === cachedData.length - 1}
            aria-label="Next file"
            className={`${arrowClass} right-5`}
          >
            <ChevronRight className="h-5 w-5" />
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
          className="hidden border-l border-white/10 bg-black/40 md:block"
          style={{ gridColumn: '2', gridRow: '1 / 3' }}
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
