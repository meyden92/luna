import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import BinList from '@/components/bin/BinList';
import BinUploader from '@/components/bin/BinUploader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { listMySnippets } from '@/server/fns/dashboard/snippets';
import styles from './index.module.css';

const myBinsQuery = queryOptions({
  queryKey: queryKeys.bins.mine,
  queryFn: () => listMySnippets(),
});

export const Route = createFileRoute('/_dashboard/_bin/bin/')({
  head: () => ({ meta: [{ title: 'Snippets | LunaShare' }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myBinsQuery),
  component: BinPage,
});

function BinPage() {
  const { data: bins } = useSuspenseQuery(myBinsQuery);

  return (
    <div className="container stack space-8 pad-y-8">
      <div className={styles.header}>
        <h1 className={cn('type-4xl weight-bold', styles.title)}>Your Snippets</h1>
        <p className={cn('type-lg', styles.subtitle)}>
          Store, organize, and share your code snippets securely. All snippets are private by default.
        </p>
      </div>

      <Card className={styles.card}>
        <CardHeader className="pad-y-4">
          <CardTitle className={cn('type-xl', styles.cardTitle)}>
            <div className={styles.iconWell}>
              <svg
                className={styles.icon}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                role="img"
                aria-label="Create new snippet"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            Create New Snippet
          </CardTitle>
          <CardDescription className="type-base">Share your code with better syntax highlighting and organization</CardDescription>
        </CardHeader>
        <CardContent>
          <BinUploader />
        </CardContent>
      </Card>

      <Card className={styles.card}>
        <CardHeader className="pad-y-4">
          <CardTitle className={cn('type-xl', styles.cardTitle)}>
            <div
              className={styles.iconWell}
              data-tone="info"
            >
              <svg
                className={styles.icon}
                data-tone="info"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                role="img"
                aria-label={`My Snippets (${bins.length})`}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            My Snippets ({bins.length})
          </CardTitle>
          <CardDescription className="type-base">
            {bins.length > 0 ? 'Click any snippet to view it in a new tab' : 'Your uploaded snippets will appear here'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BinList bins={bins} />
        </CardContent>
      </Card>
    </div>
  );
}
