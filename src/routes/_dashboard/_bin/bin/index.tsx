import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import BinList from '@/components/bin/BinList';
import BinUploader from '@/components/bin/BinUploader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/libs/query-keys';
import { listMySnippets } from '@/server/fns/dashboard/snippets';

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
    <div className="container py-8 space-y-8 mx-auto max-w-5xl">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Your Snippets</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Store, organize, and share your code snippets securely. All snippets are private by default.
        </p>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2">
              <svg
                className="h-5 w-5 text-primary"
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
          <CardDescription className="text-base">Share your code with better syntax highlighting and organization</CardDescription>
        </CardHeader>
        <CardContent>
          <BinUploader />
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <svg
                className="h-5 w-5 text-blue-600"
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
          <CardDescription className="text-base">
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
