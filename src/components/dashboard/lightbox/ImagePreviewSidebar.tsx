import { useVirtualizer } from '@tanstack/react-virtual';
import { File, FileText, FolderArchive, Music, Video } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
import { getCDNImage, isPreviewableFile } from '@/libs/utils';
import styles from './ImagePreviewSidebar.module.css';

interface FileData {
  id: string;
  url: string;
  title: string | null;
  contentType: string;
}

interface ImagePreviewSidebarProps {
  images: FileData[];
  currentIndex: number;
  onImageClick: (index: number) => void;
  userId: string;
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith('audio/')) return Music;
  if (contentType.startsWith('video/')) return Video;
  if (contentType.includes('pdf')) return FileText;
  if (contentType.includes('zip') || contentType.includes('archive')) return FolderArchive;
  return File;
}

function buildCdnUrl(userId: string, url: string) {
  return getCDNImage(`/${userId}/${url}`);
}

interface ThumbnailProps {
  file: FileData;
  userId: string;
  index: number;
  isActive: boolean;
  onSelect: (index: number) => void;
}

const Thumbnail = memo(function Thumbnail({ file, userId, index, isActive, onSelect }: ThumbnailProps) {
  const canPreview = isPreviewableFile(file.contentType);
  const FileIcon = getFileIcon(file.contentType);

  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      aria-label={`View ${file.title || 'file'}`}
      aria-current={isActive}
      data-active={isActive}
      className={styles.thumb}
    >
      <div className={styles.frame}>
        {canPreview ? (
          <img
            src={buildCdnUrl(userId, file.url)}
            alt={file.title || 'Thumbnail'}
            sizes="140px"
            loading="lazy"
            className={styles.image}
          />
        ) : (
          <div className={styles.placeholder}>
            <FileIcon
              className={styles.placeholderIcon}
              aria-hidden
            />
          </div>
        )}
      </div>
    </button>
  );
});

// Constants for scroll behavior
const ITEM_HEIGHT = 90; // Approximate height of each thumbnail (aspect-video ~56.25% of ~140px width + gap)
const EDGE_THRESHOLD = 90; // Threshold to trigger scroll before item goes off-screen

export default function ImagePreviewSidebar({ images, currentIndex, onImageClick, userId }: ImagePreviewSidebarProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isInitialRenderRef = useRef(true);
  const prevIndexRef = useRef(currentIndex);

  const virtualizer = useVirtualizer({
    count: images.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  // Edge-detection scroll logic - only scrolls when item is near viewport edge
  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;

    // On initial render, center the current item (no animation)
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false;
      prevIndexRef.current = currentIndex;
      virtualizer.scrollToIndex(currentIndex, { align: 'center', behavior: 'auto' });
      return;
    }

    // Only process if index actually changed
    if (prevIndexRef.current === currentIndex) return;

    const isScrollingDown = currentIndex > prevIndexRef.current;
    prevIndexRef.current = currentIndex;

    // Calculate item position relative to viewport
    const itemStart = virtualizer.getOffsetForIndex(currentIndex, 'start')?.[0] ?? 0;
    const itemEnd = itemStart + ITEM_HEIGHT;
    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    const viewportBottom = scrollTop + viewportHeight;

    // Check if item is near the edge in the direction we're scrolling
    const isNearBottom = itemEnd > viewportBottom - EDGE_THRESHOLD;
    const isNearTop = itemStart < scrollTop + EDGE_THRESHOLD;
    const shouldScroll = isScrollingDown ? isNearBottom : isNearTop;

    if (shouldScroll) {
      // When scrolling down: position at start so user can continue down
      // When scrolling up: position at end so user can continue up
      virtualizer.scrollToIndex(currentIndex, {
        align: isScrollingDown ? 'start' : 'end',
        behavior: 'smooth',
      });
    }
  }, [currentIndex, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={styles.scroller}
    >
      <div
        className={styles.list}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const file = images[virtualRow.index];
          if (!file) return null;

          return (
            <div
              key={file.id}
              className={styles.row}
              style={{ top: virtualRow.start }}
            >
              <Thumbnail
                file={file}
                userId={userId}
                index={virtualRow.index}
                isActive={virtualRow.index === currentIndex}
                onSelect={onImageClick}
              />
            </div>
          );
        })}
      </div>
      {/* Spacer at bottom for better UX */}
      <div className={styles.spacer} />
    </div>
  );
}
