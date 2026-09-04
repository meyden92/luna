import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { z } from 'zod';
import { CreateUserDialog } from '@/components/admin/user/create-user-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/libs/query-keys';
import { storageQuotaMiBToBytes } from '@/libs/storage-quota';
import { cn, formatSize, getAvatarUrl } from '@/libs/utils';
import { listAdminUsersWithFiles } from '@/server/fns/admin/users';
import styles from './index.module.css';

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
    if (search.sort !== field) return <ArrowUpDown className={styles.sortIcon} />;
    return search.order === 'asc' ? <ArrowUp className={styles.sortIcon} /> : <ArrowDown className={styles.sortIcon} />;
  };

  const startIndex = data.total === 0 ? 0 : (search.page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(search.page * PAGE_SIZE, data.total);

  return (
    <div className="pad-6">
      <Card>
        <CardHeader className="space-4">
          <div className={styles.toolbar}>
            <div className="cluster space-3">
              <CardTitle>All Registered Users</CardTitle>
              <CreateUserDialog />
            </div>
            <form
              className={styles.searchForm}
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
                className={styles.searchInput}
              />
              <Button type="submit">
                <Search className={styles.icon} />
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
          <p className={cn(styles.muted, 'type-sm')}>
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
                    className={styles.sortButton}
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
                    className={styles.sortButton}
                    onClick={() => handleSort('name')}
                  >
                    Username
                    <SortIcon field="name" />
                  </Button>
                </TableHead>
                <TableHead
                  className={styles.alignEnd}
                  aria-sort={sortDirection('files')}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(styles.sortButton, styles.sortButtonEnd)}
                    onClick={() => handleSort('files')}
                  >
                    Uploaded Files
                    <SortIcon field="files" />
                  </Button>
                </TableHead>
                <TableHead className={styles.alignEnd}>Filesize</TableHead>
                <TableHead
                  className={styles.alignEnd}
                  aria-sort={sortDirection('role')}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(styles.sortButton, styles.sortButtonEnd)}
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
                    className={styles.emptyCell}
                  >
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="weight-medium">
                      <div className={styles.userCell}>
                        <img
                          src={getAvatarUrl(user.image) ?? '/default-avatar.png'}
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
                    <TableCell className={styles.alignEnd}>{user.fileCount}</TableCell>
                    <TableCell className={styles.alignEnd}>
                      <div className={styles.quotaCell}>
                        <span>
                          {formatSize(user.totalSize)} / {formatSize(storageQuotaMiBToBytes(user.storageQuotaMiB))}
                        </span>
                        <Link
                          to="/admin/users/$userid"
                          params={{ userid: user.id }}
                          className={cn(styles.quotaLink, 'type-xs')}
                        >
                          Manage quota
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className={styles.alignEnd}>{user.role || 'User'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {data.totalPages > 1 && (
            <div className={cn(styles.pagination, 'margin-top-4')}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateSearch({ page: search.page - 1 })}
                disabled={search.page <= 1}
              >
                <ChevronLeft className={styles.icon} />
                Previous
              </Button>
              <span className={cn(styles.muted, 'type-sm')}>
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
                <ChevronRight className={styles.icon} />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
