import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { format, isThisMonth, isThisWeek, isToday, isYesterday } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGalleryStore } from '@/hooks/stores/gallery-store';
import { useBulkSelection } from '@/hooks/stores/use-bulk-selection';
import { densityMetrics, useGalleryView } from '@/hooks/stores/use-gallery-view';
import type { GalleryFile } from '@/types/project';
import { DayCheckbox } from './day-checkbox';
import GalleryEntry from './GalleryEntry';
import { GallerySkeleton } from './GallerySkeleton';
import styles from './VirtualizedGallery.module.css';

interface VirtualizedGalleryProps {
  files: GalleryFile[];
  userId: string;
  selectedFolderId: string | null;
  scopeLabel?: string;
  onPreviewClick: (fileId: string) => void;
  handleDeleteSingle: (fileId: string) => void;
  handleDeleteMultiple: (fileIds: string[]) => void;
  clearSelection: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onLoadMore?: () => void;
}

/** A dateKey is either a well-known relative key or a "YYYY-MM" month key */
type DateGroupKey = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | string;

interface VirtualGroup {
  dateKey: DateGroupKey;
  /** Human-readable label (translated or formatted month name) */
  label: string;
  /** Compact label for the timeline rail */
  railLabel: string;
  /** Mono meta line next to the heading, e.g. "2026 — 27 files" */
  meta: string;
  files: GalleryFile[];
  fileIds: string[];
  key: string;
}

interface JustifiedItem {
  file: GalleryFile;
  width: number;
}

interface JustifiedRow {
  items: JustifiedItem[];
  height: number;
}

interface GroupLayout {
  /** Justified rows (rows mode) — null in grid mode */
  rows: JustifiedRow[] | null;
  /** Column count (grid mode) — null in rows mode */
  columns: number | null;
  /** Exact pixel height of the gallery content (without header/margins) */
  contentHeight: number;
}

const GROUP_HEADER_HEIGHT = 52; // serif heading line + 16px margin below
const GROUP_TOP_MARGIN = 30; // spacing between month sections
const RAIL_SHORT_LABELS: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yest',
  thisWeek: 'Week',
  thisMonth: 'Month',
};

/**
 * Assigns a file to a date group key.
 * Order: today → yesterday → thisWeek → thisMonth → "YYYY-MM" per month
 */
function getDateGroupKey(date: Date): DateGroupKey {
  if (isToday(date)) return 'today';
  if (isYesterday(date)) return 'yesterday';
  if (isThisWeek(date, { weekStartsOn: 1 })) return 'thisWeek';
  if (isThisMonth(date)) return 'thisMonth';
  // Older months: use "YYYY-MM" as key
  return format(date, 'yyyy-MM');
}

function fileAspect(file: GalleryFile): number {
  const w = file.metadata?.width;
  const h = file.metadata?.height;
  return w && h ? w / h : 4 / 3;
}

/** Flickr-style justified rows: fill a row until shrinking to fit drops at/below the target height. */
function layoutJustifiedRows(files: GalleryFile[], containerWidth: number, targetHeight: number, gap: number): JustifiedRow[] {
  const rows: JustifiedRow[] = [];
  let pending: { file: GalleryFile; aspect: number }[] = [];
  let aspectSum = 0;

  for (const file of files) {
    const aspect = fileAspect(file);
    pending.push({ file, aspect });
    aspectSum += aspect;
    const height = (containerWidth - gap * (pending.length - 1)) / aspectSum;
    if (height <= targetHeight) {
      rows.push({ items: pending.map((p) => ({ file: p.file, width: height * p.aspect })), height });
      pending = [];
      aspectSum = 0;
    }
  }
  if (pending.length) {
    const height = Math.min(targetHeight, (containerWidth - gap * (pending.length - 1)) / aspectSum);
    rows.push({ items: pending.map((p) => ({ file: p.file, width: height * p.aspect })), height });
  }
  return rows;
}

function computeGroupLayout(group: VirtualGroup, containerWidth: number, layout: 'rows' | 'grid', density: number): GroupLayout {
  const { targetRowHeight, gridCardMin, gap } = densityMetrics(density);

  if (layout === 'rows') {
    const rows = layoutJustifiedRows(group.files, containerWidth, targetRowHeight, gap);
    const contentHeight = rows.reduce((sum, row) => sum + row.height, 0) + gap * Math.max(0, rows.length - 1);
    return { rows, columns: null, contentHeight };
  }

  const columns = Math.max(1, Math.floor((containerWidth + gap) / (gridCardMin + gap)));
  const columnWidth = (containerWidth - gap * (columns - 1)) / columns;
  const rowCount = Math.ceil(group.files.length / columns);
  const rowHeight = columnWidth * (3 / 4); // grid cards are 4:3
  const contentHeight = rowCount * rowHeight + gap * Math.max(0, rowCount - 1);
  return { rows: null, columns, contentHeight };
}

const MonthSection = memo(function MonthSection({
  group,
  layout,
  index,
  isFirst,
  gap,
  userId,
  selectedFolderId,
  onPreviewClick,
  handleDeleteSingle,
  handleDeleteMultiple,
  clearSelection,
  selectedCount,
}: {
  group: VirtualGroup;
  layout: GroupLayout;
  index: number;
  isFirst: boolean;
  gap: number;
  userId: string;
  selectedFolderId: string | null;
  onPreviewClick: (fileId: string) => void;
  handleDeleteSingle: (fileId: string) => void;
  handleDeleteMultiple: (fileIds: string[]) => void;
  clearSelection: () => void;
  selectedCount: number;
}) {
  const cardProps = {
    userId,
    handleDeleteAction: handleDeleteSingle,
    onPreview: onPreviewClick,
    showFolderBadge: selectedFolderId === null,
    selectedCount,
    onClearSelection: clearSelection,
    onDeleteMultiple: handleDeleteMultiple,
  };

  return (
    <section
      className={styles.section}
      data-first={isFirst || undefined}
    >
      <header
        className={styles.header}
        style={{ height: GROUP_HEADER_HEIGHT - 16, marginBottom: 16 }}
      >
        <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
        <h2 className={styles.title}>{group.label}</h2>
        <span className={styles.meta}>{group.meta}</span>
        <span className={styles.rule} />
        <DayCheckbox
          date={group.dateKey}
          fileIds={group.fileIds}
        />
      </header>

      {layout.rows ? (
        <div
          className={styles.rows}
          style={{ gap }}
        >
          {layout.rows.map((row, rowIndex) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional slices of a stable file list
              key={rowIndex}
              className={styles.row}
              style={{ height: row.height, gap }}
            >
              {row.items.map(({ file, width }) => (
                <GalleryEntry
                  key={file.id}
                  file={file}
                  width={width}
                  height={row.height}
                  {...cardProps}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          className={styles.grid}
          style={{ gap, gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}
        >
          {group.files.map((file) => (
            <GalleryEntry
              key={file.id}
              file={file}
              {...cardProps}
            />
          ))}
        </div>
      )}
    </section>
  );
});

/** Fixed right-edge timeline — jump between loaded date groups. */
function TimelineRail({ groups, activeIndex, onJump }: { groups: VirtualGroup[]; activeIndex: number; onJump: (index: number) => void }) {
  return (
    <nav
      aria-label="Timeline"
      className={styles.rail}
    >
      <span className={styles.railLine} />
      {groups.map((group, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={group.key}
            type="button"
            onClick={() => onJump(index)}
            aria-label={`Jump to ${group.label}`}
            aria-current={isActive ? 'true' : undefined}
            className={styles.stop}
          >
            <span
              className={styles.tick}
              data-active={isActive || undefined}
            />
            <span
              aria-hidden
              className={styles.stopLabel}
              data-active={isActive || undefined}
            >
              {group.railLabel}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function EmptyState({ scopeLabel }: { scopeLabel: string }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyGlyph} />
      <p className={styles.emptyTitle}>Nothing in “{scopeLabel}” yet</p>
      <p className={styles.emptyHint}>Adjust your filters, or upload something new.</p>
    </div>
  );
}

export default function VirtualizedGallery({
  files,
  userId,
  selectedFolderId,
  scopeLabel = 'your library',
  onPreviewClick,
  handleDeleteSingle,
  handleDeleteMultiple,
  clearSelection,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  isError,
  onRetry,
  onLoadMore,
}: VirtualizedGalleryProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const selectedCount = useBulkSelection((state) => state.selectedFiles.size);
  const layout = useGalleryView((state) => state.layout);
  const density = useGalleryView((state) => state.density);
  const galleryGap = densityMetrics(density).gap;
  const scrollToIndex = useGalleryStore((state) => state.scrollToIndex);
  const setScrollToIndex = useGalleryStore((state) => state.setScrollToIndex);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  // Measure layout offset + container width for the justified layout. Keyed on
  // files.length because the measured element only mounts once files exist —
  // a mount-only effect would run against the loading/empty early returns and
  // never observe the real container.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when files.length changes
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      setScrollMargin(el.offsetTop);
      setContainerWidth(el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [files.length]);

  // Group files by date into ordered virtual groups (today, yesterday, thisWeek, thisMonth, then per-month)
  const virtualGroups = useMemo(() => {
    const wellKnownOrder = ['today', 'yesterday', 'thisWeek', 'thisMonth'];
    const buckets: Record<string, GalleryFile[]> = {};
    const monthKeys: string[] = []; // track order of month keys

    for (const file of files) {
      if (file.createdAt) {
        const dateKey = getDateGroupKey(new Date(file.createdAt));
        if (!buckets[dateKey]) {
          buckets[dateKey] = [];
          if (!wellKnownOrder.includes(dateKey) && !monthKeys.includes(dateKey)) {
            monthKeys.push(dateKey);
          }
        }
        buckets[dateKey].push(file);
      }
    }

    // Sort month keys descending (newest first)
    monthKeys.sort((a, b) => b.localeCompare(a));

    // Build ordered key list: well-known first, then months
    const orderedKeys = [...wellKnownOrder, ...monthKeys];

    const dateGroupLabels: Record<string, string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      thisWeek: 'This Week',
      thisMonth: 'This Month',
    };

    const groups: VirtualGroup[] = [];
    for (const key of orderedKeys) {
      const groupFiles = buckets[key];
      if (groupFiles && groupFiles.length > 0) {
        let label: string;
        let railLabel: string;
        if (wellKnownOrder.includes(key)) {
          label = dateGroupLabels[key] ?? key;
          railLabel = RAIL_SHORT_LABELS[key] ?? label;
        } else {
          // "YYYY-MM" → "March 2025"
          const [year, month] = key.split('-');
          const date = new Date(Number(year), Number(month) - 1, 1);
          label = format(date, 'MMMM yyyy', { locale: enUS });
          railLabel = format(date, 'MMM', { locale: enUS });
        }

        const firstDate = format(new Date(groupFiles[0]!.createdAt!), 'MMM d, yyyy', { locale: enUS });
        const countLabel = `${groupFiles.length} file${groupFiles.length === 1 ? '' : 's'}`;

        groups.push({
          dateKey: key,
          label,
          railLabel,
          meta: `${firstDate} — ${countLabel}`,
          files: groupFiles,
          fileIds: groupFiles.map((f) => f.id),
          key: `group-${key}`,
        });
      }
    }
    return groups;
  }, [files]);

  // Deterministic per-group layout → exact section heights for the virtualizer
  const groupLayouts = useMemo(() => {
    if (!containerWidth) return [];
    return virtualGroups.map((group) => computeGroupLayout(group, containerWidth, layout, density));
  }, [virtualGroups, containerWidth, layout, density]);

  const groupSizes = useMemo(
    () => groupLayouts.map((groupLayout, index) => (index === 0 ? 0 : GROUP_TOP_MARGIN) + GROUP_HEADER_HEIGHT + groupLayout.contentHeight),
    [groupLayouts],
  );

  /** Absolute document offset of each group (for rail tracking + jumps). */
  const groupOffsets = useMemo(() => {
    const offsets: number[] = [];
    let cursor = scrollMargin;
    for (const size of groupSizes) {
      offsets.push(cursor);
      cursor += size;
    }
    return offsets;
  }, [groupSizes, scrollMargin]);

  const virtualizer = useWindowVirtualizer({
    count: groupLayouts.length,
    estimateSize: (index) => groupSizes[index] ?? 400,
    overscan: 2,
    scrollMargin,
  });

  // Sizes are exact but change with width/density/layout — keep the virtualizer in sync
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever any size input changes
  useEffect(() => {
    virtualizer.measure();
  }, [groupSizes, virtualizer]);

  useEffect(() => {
    let frame = 0;
    const updateScrollState = () => {
      // Track the active timeline group
      const probe = window.scrollY + 200;
      let active = 0;
      for (let i = 0; i < groupOffsets.length; i++) {
        if ((groupOffsets[i] ?? 0) <= probe) active = i;
      }
      setActiveGroupIndex(active);
    };

    // Coalesce scroll/resize into one rAF to avoid a forced layout read per event
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateScrollState();
      });
    };

    updateScrollState();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [groupOffsets]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasNextPage || !onLoadMore || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onLoadMore();
      },
      { rootMargin: '600px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  // Map file IDs to virtual group indices for scroll-to functionality
  const fileIdToGroupIndex = useMemo(() => {
    const map = new Map<string, number>();
    virtualGroups.forEach((group, index) => {
      for (const file of group.files) {
        map.set(file.id, index);
      }
    });
    return map;
  }, [virtualGroups]);

  // Scroll to file when lightbox closes
  useEffect(() => {
    if (scrollToIndex === null) return;

    const file = files[scrollToIndex];
    if (!file) {
      setScrollToIndex(null);
      return;
    }

    const groupIndex = fileIdToGroupIndex.get(file.id);
    if (groupIndex !== undefined) {
      virtualizer.scrollToIndex(groupIndex, { align: 'center', behavior: 'auto' });
    }

    setScrollToIndex(null);
  }, [scrollToIndex, files, fileIdToGroupIndex, virtualizer, setScrollToIndex]);

  const jumpToGroup = (index: number) => {
    const offset = groupOffsets[index];
    if (offset === undefined) return;
    // Land below the fixed nav + sticky toolbar
    window.scrollTo({ top: Math.max(0, offset - 140), behavior: 'smooth' });
  };

  // Show skeleton during initial load
  if (isLoading && files.length === 0) {
    return (
      <GallerySkeleton
        columns={4}
        count={12}
      />
    );
  }

  // Error state (failed query with no loaded files)
  if (isError && files.length === 0) {
    return (
      <div className={styles.errorWrap}>
        <div className={styles.errorCard}>
          <p className={styles.emptyTitle}>Couldn't load your files</p>
          <p className={`${styles.emptyHint} margin-top-2`}>Something went wrong while loading the gallery. Please try again.</p>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              className={styles.retry}
              onClick={onRetry}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Empty state
  if (files.length === 0) {
    return <EmptyState scopeLabel={scopeLabel} />;
  }

  return (
    <>
      {virtualGroups.length > 1 && (
        <div className={styles.jumpBar}>
          <label className={styles.jumpLabel}>
            Jump to
            <select
              value={activeGroupIndex}
              onChange={(event) => jumpToGroup(Number(event.target.value))}
              className={styles.jumpSelect}
              aria-label="Jump to timeline group"
            >
              {virtualGroups.map((group, index) => (
                <option
                  key={group.key}
                  value={index}
                >
                  {group.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div ref={listRef}>
        <div
          className={styles.viewport}
          style={{ height: virtualizer.getTotalSize() }}
        >
          {containerWidth > 0 &&
            virtualizer.getVirtualItems().map((virtualRow) => {
              const group = virtualGroups[virtualRow.index];
              const groupLayout = groupLayouts[virtualRow.index];
              if (!group || !groupLayout) return null;

              return (
                <div
                  key={group.key}
                  className={styles.groupPosition}
                  style={{ top: virtualRow.start - scrollMargin }}
                >
                  <MonthSection
                    group={group}
                    layout={groupLayout}
                    index={virtualRow.index}
                    isFirst={virtualRow.index === 0}
                    gap={galleryGap}
                    userId={userId}
                    selectedFolderId={selectedFolderId}
                    onPreviewClick={onPreviewClick}
                    handleDeleteSingle={handleDeleteSingle}
                    handleDeleteMultiple={handleDeleteMultiple}
                    clearSelection={clearSelection}
                    selectedCount={selectedCount}
                  />
                </div>
              );
            })}
        </div>
      </div>

      <div
        ref={loadMoreSentinelRef}
        aria-hidden="true"
        className={styles.sentinel}
      />

      {virtualGroups.length > 1 && (
        <TimelineRail
          groups={virtualGroups}
          activeIndex={activeGroupIndex}
          onJump={jumpToGroup}
        />
      )}

      {isFetchingNextPage && (
        <div className={styles.spinnerWrap}>
          <div className={styles.spinner} />
        </div>
      )}
    </>
  );
}
