import { Skeleton } from '@/components/ui/skeleton';

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
      className="px-4 py-4"
      role="status"
      aria-busy="true"
      aria-label="Loading gallery"
    >
      {/* Date pill skeleton */}
      <div className="flex items-center mb-4">
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>

      {/* Grid skeleton */}
      <div
        className="gallery-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const ratio = SKELETON_RATIOS[i % SKELETON_RATIOS.length];
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton items never reorder
              key={i}
            >
              <div className="rounded-2xl overflow-hidden border border-border/20">
                <Skeleton
                  className="w-full rounded-none"
                  style={{ aspectRatio: `1 / ${ratio}` }}
                />
                {/* Metadata skeleton below */}
                <div className="px-3 py-2.5 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4 rounded" />
                  <Skeleton className="h-2.5 w-1/2 rounded" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
