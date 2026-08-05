import { CheckCircle, Clock, Loader2, Square, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TaskWithStatus } from '@/types/tasks';
import TaskActions from './task-actions';

interface TaskTableServerProps {
  tasks: TaskWithStatus[];
  onEdit: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

const getStatusIcon = (task: TaskWithStatus) => {
  if (task.isRunning) return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  if (task.status === 'scheduled') return <Clock className="h-4 w-4 text-green-500" />;
  if (task.status === 'stopped') return <Square className="h-4 w-4 text-yellow-500" />;
  if (task.status === 'disabled') return <XCircle className="h-4 w-4 text-red-500" />;
  return <CheckCircle className="h-4 w-4 text-gray-500" />;
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'running':
      return 'default' as const;
    case 'scheduled':
      return 'secondary' as const;
    case 'stopped':
      return 'outline' as const;
    case 'disabled':
      return 'destructive' as const;
    default:
      return 'outline' as const;
  }
};

const getLastExecutionBadge = (task: TaskWithStatus) => {
  if (!task.lastExecution) return <Badge variant="outline">Never</Badge>;

  const { status } = task.lastExecution;
  switch (status) {
    case 'success':
      return <Badge variant="secondary">Success</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'timeout':
      return <Badge variant="destructive">Timeout</Badge>;
    case 'running':
      return <Badge variant="default">Running</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function TaskTableServer({ tasks, onEdit, onDelete }: TaskTableServerProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Function</TableHead>
          <TableHead>Schedule</TableHead>
          <TableHead>Next Run</TableHead>
          <TableHead>Last Execution</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow
            key={task.id}
            className="group"
          >
            <TableCell>
              <div className="flex items-center gap-2">
                {getStatusIcon(task)}
                <div>
                  <div className="font-medium">{task.name}</div>
                  <div className="text-sm text-muted-foreground line-clamp-1">{task.description}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge>
            </TableCell>
            <TableCell>
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{task.taskFunction}</code>
            </TableCell>
            <TableCell>
              <code className="text-xs">{task.cronExpression}</code>
            </TableCell>
            <TableCell>
              {task.nextExecution ? (
                <span className="text-sm">{new Date(task.nextExecution).toLocaleString()}</span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {getLastExecutionBadge(task)}
                {task.lastExecution && (
                  <span className="text-xs text-muted-foreground">{new Date(task.lastExecution.startedAt).toLocaleString()}</span>
                )}
              </div>
            </TableCell>
            <TableCell>
              <TaskActions
                task={task}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
