import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Gauge } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatSize } from '@/libs/utils';
import { getAdminEgressTopConsumers } from '@/server/fns/admin/egress';

export const Route = createFileRoute('/_admin/admin/egress/')({
  head: () => ({ meta: [{ title: 'Egress | LunaShare' }] }),
  component: AdminEgressPage,
});

function AdminEgressPage() {
  const { data = [] } = useQuery({ queryKey: ['admin', 'egress', 'top-consumers'], queryFn: () => getAdminEgressTopConsumers() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Gauge className="h-6 w-6" />
          Egress
        </h1>
        <p className="text-sm text-muted-foreground">Estimated and measured delivery bandwidth for the current month.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Top Consumers</CardTitle>
          <CardDescription>Rollups are grouped by owner for the active monthly period.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead className="text-right">Bytes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.ownerId}>
                  <TableCell className="font-mono text-xs">{row.ownerId}</TableCell>
                  <TableCell>{row.requestCount}</TableCell>
                  <TableCell className="text-right">{formatSize(Number(row.bytes))}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No egress recorded this month.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
