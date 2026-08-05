import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/libs/query-keys';
import { storageQuotaMiBToBytes } from '@/libs/storage-quota';
import { formatSize } from '@/libs/utils';
import { listAdminUsersWithFiles } from '@/server/fns/admin/users';

const PAGE_SIZE = 25;

const searchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().optional(),
  sort: z.enum(['email', 'name', 'role', 'files']).default('email'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

type SearchState = z.infer<typeof searchSchema>;

const usersQueryOptions = (search: SearchState) =>
  queryOptions({
    queryKey: queryKeys.admin.usersWithFiles(search),
    queryFn: () =>
      listAdminUsersWithFiles({
        data: {
          page: search.page,
          pageSize: PAGE_SIZE,
          search: search.search,
          sort: search.sort,
          order: search.order,
        },
      }),
  });

export const Route = createFileRoute('/_admin/admin/users/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps }) => {
    const data = await context.queryClient.ensureQueryData(usersQueryOptions(deps.search));
    const lastPage = Math.max(data.totalPages, 1);
    if (deps.search.page > lastPage) {
      throw redirect({
        to: '/admin/users',
        search: { ...deps.search, page: lastPage },
      });
    }
    return data;
  },
  head: () => ({ meta: [{ title: 'Users | LunaShare' }] }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(usersQueryOptions(search));
  const users = data.users;

  const updateSearch = (updates: Partial<SearchState>) => navigate({ search: (prev) => ({ ...prev, ...updates }) });

  const updateSearchAndResetPage = (updates: Partial<SearchState>) => navigate({ search: (prev) => ({ ...prev, ...updates, page: 1 }) });

  const handleSort = (field: SearchState['sort']) => {
    updateSearchAndResetPage({
      sort: field,
      order: search.sort === field && search.order === 'asc' ? 'desc' : 'asc',
    });
  };

  const sortDirection = (field: SearchState['sort']) => {
    if (search.sort !== field) return 'none';
    return search.order === 'asc' ? 'ascending' : 'descending';
  };

  const SortIcon = ({ field }: { field: SearchState['sort'] }) => {
    if (search.sort !== field) return <ArrowUpDown className="ml-1 h-3 w-3" />;
    return search.order === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const startIndex = data.total === 0 ? 0 : (search.page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(search.page * PAGE_SIZE, data.total);

  return (
    <div className="p-6">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>All Registered Users</CardTitle>
            <form
              className="flex w-full gap-2 sm:w-auto"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const value = String(formData.get('search') ?? '').trim();
                updateSearchAndResetPage({ search: value || undefined });
              }}
            >
              <Input
                key={search.search ?? ''}
                name="search"
                defaultValue={search.search ?? ''}
                placeholder="Search users"
                className="sm:w-64"
              />
              <Button type="submit">
                <Search className="h-4 w-4" />
                Search
              </Button>
              {search.search && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateSearchAndResetPage({ search: undefined })}
                >
                  Clear
                </Button>
              )}
            </form>
          </div>
          <p className="text-sm text-muted-foreground">
            Showing {startIndex}-{endIndex} of {data.total} users
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead aria-sort={sortDirection('email')}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto p-0 font-medium"
                    onClick={() => handleSort('email')}
                  >
                    Email
                    <SortIcon field="email" />
                  </Button>
                </TableHead>
                <TableHead aria-sort={sortDirection('name')}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto p-0 font-medium"
                    onClick={() => handleSort('name')}
                  >
                    Username
                    <SortIcon field="name" />
                  </Button>
                </TableHead>
                <TableHead
                  className="text-right"
                  aria-sort={sortDirection('files')}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto h-auto p-0 font-medium"
                    onClick={() => handleSort('files')}
                  >
                    Uploaded Files
                    <SortIcon field="files" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">Filesize</TableHead>
                <TableHead
                  className="text-right"
                  aria-sort={sortDirection('role')}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-auto h-auto p-0 font-medium"
                    onClick={() => handleSort('role')}
                  >
                    Role
                    <SortIcon field="role" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <img
                          src={user.image || '/default-avatar.png'}
                          alt={user.name}
                          width={32}
                          height={32}
                        />
                        <Link
                          to="/admin/users/$userid"
                          params={{ userid: user.id }}
                        >
                          {user.email}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell className="text-right">{user.fileCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span>
                          {formatSize(user.totalSize)} / {formatSize(storageQuotaMiBToBytes(user.storageQuotaMiB))}
                        </span>
                        <Link
                          to="/admin/users/$userid"
                          params={{ userid: user.id }}
                          className="text-xs text-primary hover:underline"
                        >
                          Manage quota
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{user.role || 'User'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateSearch({ page: search.page - 1 })}
                disabled={search.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {search.page} of {data.totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateSearch({ page: search.page + 1 })}
                disabled={search.page >= data.totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
