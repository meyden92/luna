import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { z } from 'zod';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { getFilesInDateRange } from '@/server/fns/dashboard/selection-files';
import styles from './selection.module.css';

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
    <div className={cn('container pad-6', styles.root)}>
      <div className="margin-top-8">
        <div className={styles.card}>
          <h2 className="type-lg weight-semibold margin-bottom-2">Selected Date Range (Server-Side):</h2>
          <p className={cn('type-base', styles.muted)}>From: {format(from, 'PPP')}</p>
          <p className={cn('type-base', styles.muted)}>To: {format(to, 'PPP')}</p>

          <div className={cn('margin-top-4', styles.well)}>
            <p className={cn('type-sm', styles.muted)}>Server-side data:</p>
            <p className="type-sm type-mono margin-top-1">
              {format(from, 'yyyy-MM-dd')} to {format(to, 'yyyy-MM-dd')}
            </p>
          </div>
          <h3>Found {data.files.length} files</h3>
          <ul className="margin-top-4">
            {data.files.map((file) => (
              <li
                key={file.id}
                className={cn('type-sm', styles.muted)}
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
