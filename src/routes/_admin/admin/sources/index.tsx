import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { SourceCard } from '@/components/admin/sources/source-card';
import { YtDlpCard } from '@/components/admin/sources/yt-dlp-card';
import { queryKeys } from '@/libs/query-keys';
import { listSources } from '@/server/fns/admin/sources';
import styles from './index.module.css';

const sourcesQueryOptions = queryOptions({
  queryKey: queryKeys.adminSources.status,
  queryFn: () => listSources(),
});

export const Route = createFileRoute('/_admin/admin/sources/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sourcesQueryOptions),
  head: () => ({ meta: [{ title: 'Sources | LunaShare' }] }),
  component: SourcesPage,
});

function SourcesPage() {
  const { data } = useSuspenseQuery(sourcesQueryOptions);

  return (
    <div className="stack space-6">
      <div>
        <h1 className="type-3xl weight-bold">Sources</h1>
        <p className={styles.subtitle}>The websites the Downloader can save videos from, and the Source session each one uses.</p>
      </div>

      <div className={styles.cards}>
        {data.sources.map((source) => (
          <SourceCard
            key={source.key}
            source={source}
          />
        ))}
        <YtDlpCard
          version={data.ytDlpVersion}
          lastUpdateRun={data.lastUpdateRun}
        />
      </div>
    </div>
  );
}
