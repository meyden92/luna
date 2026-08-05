import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import UserFilesTable from '@/components/admin/user/user-files-table';
import { queryKeys } from '@/libs/query-keys';
import { getAdminUserFiles } from '@/server/fns/admin/users';

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  sort: z.enum(['size', 'date', 'private']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  type: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

type Search = z.infer<typeof searchSchema>;

const userFilesQueryOptions = (userId: string, search: Search) =>
  queryOptions({
    queryKey: queryKeys.admin.userFiles(userId, search),
    queryFn: () =>
      getAdminUserFiles({
        data: {
          userId,
          page: search.page,
          pageSize: 50,
          sort: search.sort,
          order: search.order,
          type: search.type,
          dateFrom: search.dateFrom,
          dateTo: search.dateTo,
        },
      }),
  });

export const Route = createFileRoute('/_admin/admin/users/$userid/files')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, params, deps }) => {
    try {
      await context.queryClient.ensureQueryData(userFilesQueryOptions(params.userid, deps.search));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'User Files | LunaShare' }] }),
  component: UserFilesPage,
});

function UserFilesPage() {
  const { userid } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(userFilesQueryOptions(userid, search));

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/users/$userid"
            params={{ userid: data.user.id }}
            title="Back to user details"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">{data.user.name}'s Files</h1>
            <p className="text-muted-foreground">
              Manage files for user: {data.user.email} ({data.totalFiles} total files)
            </p>
          </div>
        </div>

        <UserFilesTable
          files={data.files}
          userId={data.user.id}
          currentPage={search.page}
          totalPages={data.totalPages}
          totalFiles={data.totalFiles}
          currentSort={search.sort}
          currentOrder={search.order}
          currentType={search.type}
          currentDateFrom={search.dateFrom}
          currentDateTo={search.dateTo}
        />
      </div>
    </div>
  );
}
