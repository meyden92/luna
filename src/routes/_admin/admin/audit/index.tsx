import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import AuditTable from '@/components/admin/audit/AuditTable';
import { queryKeys } from '@/libs/query-keys';
import { listAuditLogs, listAuditModels } from '@/server/fns/admin/audit';

const PAGE_SIZE = 20;

const searchSchema = z.object({
  model: z.string().optional(),
  recordId: z.string().optional(),
  cursor: z.string().optional(),
  direction: z.enum(['next', 'previous']).optional(),
  search: z.string().optional(),
  action: z.string().optional(),
});

type Search = z.infer<typeof searchSchema>;

const auditModelsQueryOptions = queryOptions({
  queryKey: queryKeys.adminAudit.models,
  queryFn: () => listAuditModels(),
});

const auditLogsQueryOptions = (search: Search) =>
  queryOptions({
    queryKey: queryKeys.adminAudit.logs(search),
    queryFn: () =>
      listAuditLogs({
        data: {
          model: search.model,
          recordId: search.recordId,
          search: search.search,
          action: search.action,
          cursor: search.cursor,
          direction: search.direction,
          pageSize: PAGE_SIZE,
        },
      }),
  });

export const Route = createFileRoute('/_admin/admin/audit/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(auditModelsQueryOptions),
      context.queryClient.ensureQueryData(auditLogsQueryOptions(deps.search)),
    ]);
  },
  head: () => ({ meta: [{ title: 'Audit Log | LunaShare' }] }),
  component: AdminAuditPage,
});

function AdminAuditPage() {
  const search = Route.useSearch();
  const { data: models } = useSuspenseQuery(auditModelsQueryOptions);
  const { data: auditData } = useSuspenseQuery(auditLogsQueryOptions(search));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Audit Logs</h1>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
        <AuditTable
          searchParams={{
            model: search.model,
            recordId: search.recordId,
            search: search.search,
            action: search.action,
          }}
          models={models}
          auditData={auditData}
        />
      </div>
    </div>
  );
}
