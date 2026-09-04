import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Edit, Plus, Variable } from 'lucide-react';
import { DeleteGlobalVariableButton } from '@/components/admin/global-variables/delete-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { listGlobalVariablesWithUsage } from '@/server/fns/admin/global-variables';
import styles from './index.module.css';

const globalVariablesQueryOptions = queryOptions({
  queryKey: queryKeys.adminGlobalVars.withUsage,
  queryFn: () => listGlobalVariablesWithUsage(),
});

export const Route = createFileRoute('/_admin/admin/global-variables/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(globalVariablesQueryOptions),
  head: () => ({ meta: [{ title: 'Global Variables | LunaShare' }] }),
  component: GlobalVariablesPage,
});

function GlobalVariablesPage() {
  const { data: variables } = useSuspenseQuery(globalVariablesQueryOptions);

  return (
    <div className="stack space-6">
      <div className={styles.header}>
        <div>
          <h1 className="type-3xl weight-bold">Global Variables</h1>
          <p className={styles.subtitle}>Manage reusable variables across templates.</p>
        </div>
        <Link to="/admin/global-variables/new">
          <Button>
            <Plus className={styles.icon} />
            Create Variable
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Variables</CardTitle>
        </CardHeader>
        <CardContent>
          {variables.length === 0 ? (
            <div className={styles.empty}>
              <Variable className={styles.emptyIcon} />
              <h3 className="type-lg weight-semibold margin-bottom-2">No Global Variables</h3>
              <p className={cn(styles.subtitle, 'margin-bottom-4')}>Create your first global variable to use across templates.</p>
              <Link to="/admin/global-variables/new">
                <Button variant="outline">
                  <Plus className={styles.icon} />
                  Create Variable
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className={styles.alignEnd}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variables.map((variable) => (
                  <TableRow key={variable.id}>
                    <TableCell className="type-mono type-sm">{variable.name}</TableCell>
                    <TableCell>{variable.label}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(styles.typeBadge, 'type-xs')}
                      >
                        {variable.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{variable._count.templates} templates</Badge>
                    </TableCell>
                    <TableCell className={cn(styles.subtitle, 'type-sm')}>{new Date(variable.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell className={styles.alignEnd}>
                      <div className={styles.actionsCell}>
                        <Link
                          to="/admin/global-variables/$id/edit"
                          params={{ id: variable.id }}
                        >
                          <Button
                            size="icon"
                            variant="ghost"
                          >
                            <Edit className={styles.iconOnly} />
                          </Button>
                        </Link>
                        <DeleteGlobalVariableButton
                          id={variable.id}
                          name={variable.name}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
