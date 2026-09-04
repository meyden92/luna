import { Skeleton } from '@/components/ui/skeleton';
import styles from './GallerySkeleton.module.css';

interface GallerySkeletonProps {
  columns?: number;
  count?: number;
}

// Random-ish aspect ratios for masonry skeleton variety
const SKELETON_RATIOS = [1.33, 0.75, 1, 1.5, 0.8, 1.2, 0.66, 1.4, 1, 0.9, 1.1, 0.85];

/**
 * Skeleton loader for the masonry gallery.
 * Uses varied aspect ratios to hint at the masonry layout.
 */
export function GallerySkeleton({ columns = 4, count = 12 }: GallerySkeletonProps) {
  return (
    <div
      className={styles.root}
      role="status"
      aria-busy="true"
      aria-label="Loading gallery"
    >
      {/* Date pill skeleton */}
      <div className={styles.heading}>
        <Skeleton className={styles.pill} />
      </div>

      {/* Grid skeleton */}
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const ratio = SKELETON_RATIOS[i % SKELETON_RATIOS.length];
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton items never reorder
              key={i}
            >
              <div className={styles.card}>
                <Skeleton
                  className={styles.thumb}
                  style={{ aspectRatio: `1 / ${ratio}` }}
                />
                {/* Metadata skeleton below */}
                <div className={styles.meta}>
                  <Skeleton className={styles.metaTitle} />
                  <Skeleton className={styles.metaSub} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
