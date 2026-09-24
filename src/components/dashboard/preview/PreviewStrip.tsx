import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useRef } from 'react';
import { getFileIcon } from '@/libs/utils';
import styles from './PreviewStrip.module.css';
import { isPreviewImage, type PreviewFile, previewFileUrl } from './preview-file';

type PreviewStripProps = {
  files: readonly PreviewFile[];
  index: number;
  onNavigate: (fileId: string) => void;
  /** Asks the gallery for its next page; absent when there is none to fetch. */
  onLoadMore?: () => void;
  loadingMore: boolean;
};

/** A 16:9 thumbnail in the 10rem column, plus the gap below it. */
const ROW_HEIGHT = 90;
/** How close to the end of what has loaded, in rows, before the next page is asked for. */
const LOAD_MORE_THRESHOLD = 5;

const Thumbnail = memo(function Thumbnail({
  file,
  isActive,
  onNavigate,
}: {
  file: PreviewFile;
  isActive: boolean;
  onNavigate: (fileId: string) => void;
}) {
  const Icon = getFileIcon(file.mimeType ?? '');

  return (
    <button
      type="button"
      className={styles.thumb}
      data-active={isActive}
      aria-current={isActive}
      aria-label={`View ${file.name}`}
      onClick={() => onNavigate(file.id)}
    >
      {isPreviewImage(file.mimeType) ? (
        <img
          src={previewFileUrl(file)}
          alt=""
          loading="lazy"
          className={styles.image}
        />
      ) : (
        <Icon
          size={24}
          aria-hidden
        />
      )}
    </button>
  );
});

/**
 * The Preview's vertical filmstrip: every loaded file, virtualized, with the one
 * on the stage highlighted. Scrolling it — or walking the stage — towards the end
 * of what has loaded pulls in the gallery's next page.
 */
export function PreviewStrip({ files, index, onNavigate, onLoadMore, loadingMore }: PreviewStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  // Centre the opening file once, then only scroll as far as keeps the active one in view.
  useEffect(() => {
    virtualizer.scrollToIndex(index, hasScrolledRef.current ? { align: 'auto', behavior: 'smooth' } : { align: 'center' });
    hasScrolledRef.current = true;
  }, [index, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const lastRendered = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const reach = Math.max(index, lastRendered);

  useEffect(() => {
    if (onLoadMore && !loadingMore && reach >= files.length - LOAD_MORE_THRESHOLD) onLoadMore();
  }, [onLoadMore, loadingMore, reach, files.length]);

  return (
    <div
      ref={scrollerRef}
      className={styles.scroller}
    >
      <div
        className={styles.list}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((item) => {
          const file = files[item.index];
          if (!file) return null;
          return (
            <div
              key={file.id}
              className={styles.row}
              style={{ top: item.start }}
            >
              <Thumbnail
                file={file}
                isActive={item.index === index}
                onNavigate={onNavigate}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
