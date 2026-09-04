import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Gauge } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatSize } from '@/libs/utils';
import { getAdminEgressTopConsumers } from '@/server/fns/admin/egress';
import styles from './index.module.css';

export const Route = createFileRoute('/_admin/admin/egress/')({
  head: () => ({ meta: [{ title: 'Egress | LunaShare' }] }),
  component: AdminEgressPage,
});

function AdminEgressPage() {
  const { data = [] } = useQuery({ queryKey: ['admin', 'egress', 'top-consumers'], queryFn: () => getAdminEgressTopConsumers() });

  return (
    <div className="stack space-6">
      <div>
        <h1 className="cluster space-2 type-2xl weight-bold">
          <Gauge className={styles.icon} />
          Egress
        </h1>
        <p className={cn(styles.subtitle, 'type-sm')}>Estimated and measured delivery bandwidth for the current month.</p>
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
                <TableHead className={styles.alignEnd}>Bytes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.ownerId}>
                  <TableCell className="type-mono type-xs">{row.ownerId}</TableCell>
                  <TableCell>{row.requestCount}</TableCell>
                  <TableCell className={styles.alignEnd}>{formatSize(Number(row.bytes))}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className={cn(styles.emptyCell, 'type-sm')}
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
