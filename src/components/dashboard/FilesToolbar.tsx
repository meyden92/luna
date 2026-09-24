import { Grid2x2, Rows3, Search, SlidersHorizontal } from 'lucide-react';
import * as React from 'react';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Segmented, type SegmentedItem } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FilesSort, FilesType } from '@/hooks/stores/use-gallery-filters';
import type { GalleryLayout, GallerySize } from '@/hooks/stores/use-gallery-view';
import styles from './FilesToolbar.module.css';

const TYPE_ITEMS: readonly SegmentedItem<FilesType>[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'file', label: 'Documents' },
];

const SORT_LABELS: Record<FilesSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  name: 'Name A–Z',
  largest: 'Largest first',
};

type FilesToolbarProps = {
  query: string;
  onQueryChange: (query: string) => void;
  type: FilesType;
  onTypeChange: (type: FilesType) => void;
  sort: FilesSort;
  onSortChange: (sort: FilesSort) => void;
  layout: GalleryLayout;
  onLayoutChange: (layout: GalleryLayout) => void;
  size: GallerySize;
  onSizeChange: (size: number) => void;
};

/**
 * The Files toolbar: four controls where there used to be about ten.
 *
 * What went: the filter bar's operators and tag and privacy filters, the density
 * popover, the separate "Select" mode, and Upload — which is in the nav now
 * because it is not a Files action. What is left is what gets used, which is why
 * search is first and always visible rather than behind a button.
 *
 * `/` from anywhere on the page focuses the search field, so finding a file
 * never needs the pointer.
 */
function FilesToolbar({
  query,
  onQueryChange,
  type,
  onTypeChange,
  sort,
  onSortChange,
  layout,
  onLayoutChange,
  size,
  onSizeChange,
}: FilesToolbarProps) {
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      // Not while the owner is already typing somewhere — "/" is a character too.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  return (
    <div className={styles.root}>
      <InputGroup className={styles.search}>
        <InputGroupAddon>
          <Search size={15} />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchRef}
          value={query}
          placeholder="Search by name"
          aria-label="Search files by name"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText className={styles.shortcut}>/</InputGroupText>
        </InputGroupAddon>
      </InputGroup>

      <Segmented
        label="File type"
        className={styles.types}
        items={TYPE_ITEMS}
        value={type}
        onValueChange={onTypeChange}
      />

      <div className={styles.end}>
        <Select
          value={sort}
          onValueChange={(value) => onSortChange(value as FilesSort)}
        >
          <SelectTrigger
            size="sm"
            className={styles.sort}
            aria-label="Sort files"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <SelectItem
                key={value}
                value={value}
              >
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger
            className={styles.viewButton}
            aria-label="View options"
          >
            <SlidersHorizontal size={15} />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className={styles.viewOptions}
          >
            <div className={styles.viewGroup}>
              <span className={styles.viewLabel}>Layout</span>
              <ToggleGroup
                value={[layout]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === 'rows' || next === 'grid') onLayoutChange(next);
                }}
              >
                <ToggleGroupItem value="rows">
                  <Rows3 size={15} />
                  Rows
                </ToggleGroupItem>
                <ToggleGroupItem value="grid">
                  <Grid2x2 size={15} />
                  Grid
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className={styles.viewGroup}>
              <span className={styles.viewLabel}>Thumbnail size</span>
              <Slider
                min={1}
                max={5}
                step={1}
                value={size}
                thumbAriaLabel="Thumbnail size"
                onValueChange={(value) => onSizeChange(Array.isArray(value) ? (value[0] ?? size) : value)}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export { FilesToolbar };
