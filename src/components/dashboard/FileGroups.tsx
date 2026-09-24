import * as React from 'react';
import { groupFilesByDate } from '@/libs/file-groups';
import type { GalleryFile } from '@/types/project';
import styles from './FileGroups.module.css';

/** The aspect a card is laid out at, falling back to 4:3 where the file has no size. */
function aspectOf(file: GalleryFile): number {
  const { width, height } = file.metadata ?? {};
  if (!width || !height) return 4 / 3;
  return width / height;
}

type FileGroupsProps = {
  files: readonly GalleryFile[];
  layout: 'rows' | 'grid';
  /** Target row height, or minimum grid cell width, from the size slider. */
  rowHeight: number;
  gridCellMinWidth: number;
  /** Date headers stick under the toolbar. A user tweak, on by default. */
  stickyHeaders: boolean;
  selectedIds: ReadonlySet<string>;
  onSelectGroup: (fileIds: string[], selectAll: boolean) => void;
  renderCard: (file: GalleryFile) => React.ReactNode;
  /** Watched to pull the next page in; rendered after the last group. */
  sentinel?: React.ReactNode;
};

/**
 * The gallery: files under date headings, as justified rows or as a grid.
 *
 * Rows are plain flex wrapping with a per-card `flex-basis` derived from its
 * aspect, so a row fills the width without a layout pass in JavaScript. The
 * `max-width` is what stops a group holding one file from stretching it across
 * the whole row — which is what the old gallery did.
 *
 * Nothing is virtualised. The infinite query only holds what has been scrolled
 * to, and the scroll-driven reveal and the gallery view transition both need the
 * real elements to exist, so windowing would buy less than it costs here.
 */
function FileGroups({
  files,
  layout,
  rowHeight,
  gridCellMinWidth,
  stickyHeaders,
  selectedIds,
  onSelectGroup,
  renderCard,
  sentinel,
}: FileGroupsProps) {
  const groups = React.useMemo(() => groupFilesByDate(files, (file) => file.createdAt), [files]);

  return (
    <div>
      {groups.map((group) => {
        const ids = group.files.map((file) => file.id);
        const allSelected = ids.every((id) => selectedIds.has(id));

        return (
          <section
            key={group.id}
            className={styles.group}
            data-sticky={stickyHeaders || undefined}
          >
            <header className={styles.head}>
              <h2 className={styles.label}>{group.label}</h2>
              <span className={styles.meta}>
                {group.dateLabel} · {group.files.length} {group.files.length === 1 ? 'file' : 'files'}
              </span>
              {/* Appears on hover or keyboard focus: useful, but not part of the heading. */}
              <button
                type="button"
                className={styles.selectAll}
                onClick={() => onSelectGroup(ids, !allSelected)}
              >
                {allSelected ? 'Deselect' : 'Select all'}
              </button>
            </header>

            {layout === 'rows' ? (
              <div className={styles.rows}>
                {group.files.map((file) => {
                  const aspect = aspectOf(file);
                  return (
                    <div
                      key={file.id}
                      className={styles.rowItem}
                      style={{
                        flex: `${aspect} 1 ${rowHeight * aspect}px`,
                        maxWidth: `${rowHeight * aspect * 1.35}px`,
                        height: `${rowHeight}px`,
                      }}
                    >
                      {renderCard(file)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className={styles.grid}
                style={{ '--cell': `${gridCellMinWidth}px` } as React.CSSProperties}
              >
                {group.files.map((file) => (
                  <div
                    key={file.id}
                    className={styles.gridItem}
                  >
                    {renderCard(file)}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {sentinel}
    </div>
  );
}

export { FileGroups };
