import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { SnippetEditor } from '@/components/bin/SnippetEditor';
import { SnippetList } from '@/components/bin/SnippetList';
import type { Bin } from '@/components/bin/types';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { queryKeys } from '@/libs/query-keys';
import { startViewTransition } from '@/libs/view-transition';
import { createBin, listBins } from '@/server/fns/bins';
import styles from './index.module.css';

const myBinsQuery = queryOptions({
  queryKey: queryKeys.bins.mine,
  queryFn: () => listBins(),
});

export const Route = createFileRoute('/_dashboard/_bin/bin/')({
  head: () => ({ meta: [{ title: 'Snippets | LunaShare' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myBinsQuery),
  component: BinPage,
});

function BinPage() {
  const { data: bins } = useSuspenseQuery(myBinsQuery);
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(bins[0]?.id ?? null);
  const [query, setQuery] = useState('');

  const active = bins.find((bin) => bin.id === activeId) ?? null;

  const { mutate: create } = useMutation({
    mutationFn: () => createBin({ data: { title: 'Untitled snippet', snippet: '', isPublic: false } }),
    onSuccess: (bin) => {
      queryClient.setQueryData<Bin[]>(queryKeys.bins.mine, (current) => [bin, ...(current ?? [])]);
      startViewTransition(() => setActiveId(bin.id), 'page');
    },
  });

  const selectSnippet = (id: string) => {
    if (id === activeId) return;
    startViewTransition(() => setActiveId(id), 'page');
  };

  // The list already dropped the row by the time this runs; pick whatever is next.
  const handleDeleted = (id: string) => {
    const rest = bins.filter((bin) => bin.id !== id);
    startViewTransition(() => setActiveId(rest[0]?.id ?? null), 'page');
  };

  return (
    <div className={styles.root}>
      <SnippetList
        bins={bins}
        activeId={activeId}
        query={query}
        onQueryChange={setQuery}
        onSelect={selectSnippet}
        onCreate={() => create()}
      />
      {active ? (
        <SnippetEditor
          key={active.id}
          bin={active}
          onDeleted={handleDeleted}
        />
      ) : (
        <Empty className={styles.placeholder}>
          <EmptyHeader>
            <EmptyTitle>No snippet selected</EmptyTitle>
            <EmptyDescription>Select a snippet or create a new one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
