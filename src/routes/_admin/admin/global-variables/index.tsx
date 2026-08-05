import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Edit, Plus, Variable } from 'lucide-react';
import { DeleteGlobalVariableButton } from '@/components/admin/global-variables/delete-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/libs/query-keys';
import { listGlobalVariablesWithUsage } from '@/server/fns/admin/global-variables';

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Global Variables</h1>
          <p className="text-muted-foreground">Manage reusable variables across templates.</p>
        </div>
        <Link to="/admin/global-variables/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
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
            <div className="text-center py-12">
              <Variable className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Global Variables</h3>
              <p className="text-muted-foreground mb-4">Create your first global variable to use across templates.</p>
              <Link to="/admin/global-variables/new">
                <Button variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variables.map((variable) => (
                  <TableRow key={variable.id}>
                    <TableCell className="font-mono text-sm">{variable.name}</TableCell>
                    <TableCell>{variable.label}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="uppercase text-xs"
                      >
                        {variable.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{variable._count.templates} templates</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(variable.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          to="/admin/global-variables/$id/edit"
                          params={{ id: variable.id }}
                        >
                          <Button
                            size="icon"
                            variant="ghost"
                          >
                            <Edit className="w-4 h-4" />
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
