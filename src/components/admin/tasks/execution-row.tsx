import { Activity, Calendar, CheckCircle, Clock, Loader2, Timer, XCircle, Zap } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { listExecutions } from '@/server/fns/admin/tasks';
import ExecutionLogDialog from './execution-log-dialog';

export type ExecutionHistoryItem = Awaited<ReturnType<typeof listExecutions>>['executions'][number];

interface ExecutionRowProps {
  execution: ExecutionHistoryItem;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'success':
      return (
        <Badge
          variant="secondary"
          className="text-green-700 bg-green-100"
        >
          <CheckCircle className="h-3 w-3 mr-1" />
          Success
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case 'timeout':
      return (
        <Badge variant="destructive">
          <Timer className="h-3 w-3 mr-1" />
          Timeout
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="default">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
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
          <Calendar className="h-3 w-3 mr-1" />
          Scheduled
        </Badge>
      );
    case 'manual':
      return (
        <Badge variant="secondary">
          <Zap className="h-3 w-3 mr-1" />
          Manual
        </Badge>
      );
    case 'api':
      return (
        <Badge variant="outline">
          <Activity className="h-3 w-3 mr-1" />
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
        className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setShowLogDialog(true)}
      >
        <div className="flex items-center gap-3">
          {getStatusBadge(execution.status)}
          <div>
            <div className="font-medium text-sm">{execution.task.name}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(execution.startedAt).toLocaleString()}
              {execution.duration && ` • ${formatDuration(execution.duration)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getTriggerBadge(execution.triggeredBy)}
          {execution.executedByUser && (
            <Badge
              variant="outline"
              className="text-xs"
            >
              {execution.executedByUser.name}
            </Badge>
          )}
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
