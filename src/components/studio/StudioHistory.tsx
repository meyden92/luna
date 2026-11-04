import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Segmented, type SegmentedItem } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { queryKeys } from '@/libs/query-keys';
import type { StudioCatalogCategory, StudioEntry } from '@/libs/studio/catalog';
import type { StudioFormValues } from '@/libs/studio/form';
import type { MediaKind } from '@/libs/studio/types';
import { markGenerationsSeen } from '@/server/fns/studio';
import { HistoryEntry } from './HistoryEntry';
import { generationsQueryOptions, unseenGenerationsQueryOptions } from './queries';
import styles from './StudioHistory.module.css';

type KindFilter = MediaKind | 'all';

const KIND_ITEMS: SegmentedItem<KindFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'model3d', label: '3D' },
];

const ALL_CATEGORIES = 'all';

/**
 * Every Generation of the User's, newest first, filterable by Category and
 * media kind and kept live by the Studio events. While it is on screen, the
 * User's finished Generations count as seen.
 */
export function StudioHistory({
  catalog,
  onOpen,
}: {
  catalog: StudioCatalogCategory[];
  onOpen: (entry: StudioEntry, values: StudioFormValues) => void;
}) {
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);
  const [kind, setKind] = useState<KindFilter>('all');
  const history = useInfiniteQuery(
    generationsQueryOptions({
      categoryId: categoryId === ALL_CATEGORIES ? undefined : categoryId,
      mediaKinds: kind === 'all' ? undefined : [kind],
    }),
  );
  const generations = history.data?.pages.flatMap((page) => page.generations) ?? [];

  useMarkSeenWhileVisible();

  return (
    <section
      className={styles.root}
      aria-label="History"
    >
      <div className={styles.filters}>
        <Select
          value={categoryId}
          onValueChange={(value) => setCategoryId(value ?? ALL_CATEGORIES)}
          items={[
            { value: ALL_CATEGORIES, label: 'All categories' },
            ...catalog.map((category) => ({ value: category.id, label: category.name })),
          ]}
        >
          <SelectTrigger
            aria-label="Filter by category"
            className={styles.categoryFilter}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {catalog.map((category) => (
              <SelectItem
                key={category.id}
                value={category.id}
              >
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Segmented
          label="Filter by media kind"
          items={KIND_ITEMS}
          value={kind}
          onValueChange={setKind}
        />
      </div>

      {history.isPending ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : generations.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>What you generate shows up here, also while it is still running.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol className={styles.list}>
          {generations.map((generation) => (
            <li key={generation.id}>
              <HistoryEntry
                generation={generation}
                catalog={catalog}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ol>
      )}

      {history.hasNextPage && (
        <Button
          variant="outline"
          disabled={history.isFetchingNextPage}
          onClick={() => history.fetchNextPage()}
        >
          {history.isFetchingNextPage && <Spinner />}
          Load more
        </Button>
      )}
    </section>
  );
}

/** Marks every finished Generation seen whenever the badge has any while this tab is visible. */
function useMarkSeenWhileVisible() {
  const queryClient = useQueryClient();
  const { data: unseen } = useQuery(unseenGenerationsQueryOptions);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const count = unseen?.count ?? 0;
  useEffect(() => {
    if (!visible || count === 0) return;
    void markGenerationsSeen({ data: {} }).then(() => queryClient.invalidateQueries({ queryKey: queryKeys.studio.unseen }));
  }, [visible, count, queryClient]);
}
