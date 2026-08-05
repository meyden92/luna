import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { buttonVariants } from '@/components/ui/button';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/libs/utils';

interface AuditLog {
  id: string;
  model: string;
  action: string;
  recordId: string;
  userId: string | null;
  timestamp: Date;
  before: any;
  after: any;
  summary?: string | null;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface AuditTableRowsProps {
  logs: AuditLog[];
}

export default function AuditTableRows({ logs }: AuditTableRowsProps) {
  return (
    <TableBody>
      {logs.length > 0 ? (
        logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="font-mono text-xs text-muted-foreground">{log.id.slice(0, 8)}...</TableCell>
            <TableCell>{log.model}</TableCell>
            <TableCell>
              <span
                className={cn(
                  'px-2 py-1 rounded-full text-xs',
                  log.action === 'create'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                    : log.action === 'update'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                      : log.action === 'delete'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                        : '',
                )}
              >
                {log.action}
              </span>
            </TableCell>
            <TableCell className="font-mono text-xs">{log.recordId}</TableCell>
            <TableCell>{log.user?.name ?? 'System'}</TableCell>
            <TableCell
              className="text-sm text-muted-foreground max-w-xs truncate"
              title={log.summary || undefined}
            >
              {log.summary || formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
            </TableCell>
            <TableCell className="text-right">
              <Link
                to="/admin/audit/$auditId"
                params={{ auditId: String(log.id) }}
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
              >
                View Details
              </Link>
            </TableCell>
          </TableRow>
        ))
      ) : (
        <TableRow>
          <TableCell
            colSpan={7}
            className="h-24 text-center text-muted-foreground"
          >
            No audit logs found matching your filters.
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}
