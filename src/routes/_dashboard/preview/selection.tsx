import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { z } from 'zod';
import { queryKeys } from '@/libs/query-keys';
import { getFilesInDateRange } from '@/server/fns/dashboard/selection-files';

const selectionSearchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  submonth: z.string().optional(),
});

type SelectionSearch = z.infer<typeof selectionSearchSchema>;

const selectionQuery = (search: SelectionSearch) =>
  queryOptions({
    queryKey: queryKeys.dashboard.previewSelection(search),
    queryFn: () => getFilesInDateRange({ data: search }),
  });

export const Route = createFileRoute('/_dashboard/preview/selection')({
  head: () => ({ meta: [{ title: 'Selection | LunaShare' }] }),
  validateSearch: selectionSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(selectionQuery(deps)),
  component: SelectionPreviewPage,
});

function SelectionPreviewPage() {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(selectionQuery(search));

  const from = new Date(data.range.from);
  const to = new Date(data.range.to);

  return (
    <div className="container mx-auto p-6 bg-background">
      <div className="mt-8">
        <div className="bg-card border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Selected Date Range (Server-Side):</h2>
          <p className="text-muted-foreground">From: {format(from, 'PPP')}</p>
          <p className="text-muted-foreground">To: {format(to, 'PPP')}</p>

          <div className="mt-4 p-3 bg-muted/50 rounded">
            <p className="text-sm text-muted-foreground">Server-side data:</p>
            <p className="text-sm font-mono mt-1">
              {format(from, 'yyyy-MM-dd')} to {format(to, 'yyyy-MM-dd')}
            </p>
          </div>
          <h3>Found {data.files.length} files</h3>
          <ul className="mt-4">
            {data.files.map((file) => (
              <li
                key={file.id}
                className="text-sm text-muted-foreground"
              >
                {file.title}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
