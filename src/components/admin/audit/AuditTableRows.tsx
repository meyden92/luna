import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { buttonVariants } from '@/components/ui/button';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/libs/utils';
import styles from './AuditTableRows.module.css';

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
            <TableCell className={styles.idCell}>{log.id.slice(0, 8)}...</TableCell>
            <TableCell>{log.model}</TableCell>
            <TableCell>
              <span
                className={styles.actionPill}
                data-action={log.action}
              >
                {log.action}
              </span>
            </TableCell>
            <TableCell className={styles.recordCell}>{log.recordId}</TableCell>
            <TableCell>{log.user?.name ?? 'System'}</TableCell>
            <TableCell
              className={styles.summaryCell}
              title={log.summary || undefined}
            >
              {log.summary || formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
            </TableCell>
            <TableCell className={styles.actionsCell}>
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
            className={styles.emptyCell}
          >
            No audit logs found matching your filters.
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}
