import { Activity, Calendar, CheckCircle, Clock, Loader2, Timer, XCircle, Zap } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { listExecutions } from '@/server/fns/admin/tasks';
import ExecutionLogDialog from './execution-log-dialog';
import styles from './execution-row.module.css';

export type ExecutionHistoryItem = Awaited<ReturnType<typeof listExecutions>>['executions'][number];

interface ExecutionRowProps {
  execution: ExecutionHistoryItem;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'success':
      return (
        <Badge
          variant="outline"
          className={styles.successBadge}
        >
          <CheckCircle />
          Success
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive">
          <XCircle />
          Failed
        </Badge>
      );
    case 'timeout':
      return (
        <Badge variant="destructive">
          <Timer />
          Timeout
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="default">
          <Loader2 className={styles.runningIcon} />
          Running
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline">
          <Clock />
          Pending
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getTriggerBadge = (trigger: string) => {
  switch (trigger) {
    case 'schedule':
      return (
        <Badge variant="outline">
          <Calendar />
          Scheduled
        </Badge>
      );
    case 'manual':
      return (
        <Badge variant="secondary">
          <Zap />
          Manual
        </Badge>
      );
    case 'api':
      return (
        <Badge variant="outline">
          <Activity />
          API
        </Badge>
      );
    default:
      return <Badge variant="outline">{trigger}</Badge>;
  }
};

const formatDuration = (duration: number) => {
  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${(duration / 60000).toFixed(1)}m`;
};

export default function ExecutionRow({ execution }: ExecutionRowProps) {
  const [showLogDialog, setShowLogDialog] = useState(false);

  return (
    <>
      <div
        className={styles.root}
        onClick={() => setShowLogDialog(true)}
      >
        <div className={styles.identity}>
          {getStatusBadge(execution.status)}
          <div>
            <div className={styles.taskName}>{execution.task.name}</div>
            <div className={styles.taskMeta}>
              {new Date(execution.startedAt).toLocaleString()}
              {execution.duration && ` • ${formatDuration(execution.duration)}`}
            </div>
          </div>
        </div>
        <div className={styles.trigger}>
          {getTriggerBadge(execution.triggeredBy)}
          {execution.executedByUser && <Badge variant="outline">{execution.executedByUser.name}</Badge>}
        </div>
      </div>

      <ExecutionLogDialog
        executionId={showLogDialog ? execution.id : null}
        isOpen={showLogDialog}
        onClose={() => setShowLogDialog(false)}
      />
    </>
  );
}
