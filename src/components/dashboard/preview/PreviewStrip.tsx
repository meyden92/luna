import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useRef } from 'react';
import { getFileIcon } from '@/libs/utils';
import styles from './PreviewStrip.module.css';
import { isPreviewImage, type PreviewFile, previewFileUrl } from './preview-file';

type PreviewStripProps = {
  files: readonly PreviewFile[];
  index: number;
  onNavigate: (fileId: string) => void;
};

/** Approximate height of a thumbnail row: a 16:9 frame in the 10rem column plus its gap. */
const ITEM_HEIGHT = 90;
/** How close to the viewport edge the active thumbnail may get before the strip scrolls. */
const EDGE_THRESHOLD = 90;

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
      <div className={styles.frame}>
        {isPreviewImage(file.mimeType) ? (
          <img
            src={previewFileUrl(file)}
            alt={file.name}
            sizes="140px"
            loading="lazy"
            className={styles.image}
          />
        ) : (
          <div className={styles.placeholder}>
            <Icon
              className={styles.placeholderIcon}
              aria-hidden
            />
          </div>
        )}
      </div>
    </button>
  );
});

/**
 * The Preview's vertical filmstrip: every loaded file, virtualized, with the one
 * on the stage highlighted. It centres the opening file, then only scrolls when
 * the active thumbnail nears the edge it is travelling towards.
 */
export function PreviewStrip({ files, index, onNavigate }: PreviewStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isInitialRenderRef = useRef(true);
  const prevIndexRef = useRef(index);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false;
      prevIndexRef.current = index;
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'auto' });
      return;
    }

    if (prevIndexRef.current === index) return;
    const isScrollingDown = index > prevIndexRef.current;
    prevIndexRef.current = index;

    const itemStart = virtualizer.getOffsetForIndex(index, 'start')?.[0] ?? 0;
    const itemEnd = itemStart + ITEM_HEIGHT;
    const viewportTop = scroller.scrollTop;
    const viewportBottom = viewportTop + scroller.clientHeight;
    const isNearEdge = isScrollingDown ? itemEnd > viewportBottom - EDGE_THRESHOLD : itemStart < viewportTop + EDGE_THRESHOLD;

    // Park the active thumbnail at the far side of travel so the next steps stay in view.
    if (isNearEdge) {
      virtualizer.scrollToIndex(index, { align: isScrollingDown ? 'start' : 'end', behavior: 'smooth' });
    }
  }, [index, virtualizer]);

  return (
    <div
      ref={scrollerRef}
      className={styles.scroller}
      data-preview-strip
    >
      <div
        className={styles.list}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
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
      {/* Breathing room so the last thumbnail is not flush with the bottom edge. */}
      <div className={styles.spacer} />
    </div>
  );
}
