import { CheckCircle, Clock, Loader2, Square, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TaskWithStatus } from '@/types/tasks';
import TaskActions from './task-actions';
import styles from './task-table-server.module.css';

interface TaskTableServerProps {
  tasks: TaskWithStatus[];
  onEdit: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

const getStatusIcon = (task: TaskWithStatus) => {
  if (task.isRunning)
    return (
      <Loader2
        className={styles.statusIcon}
        data-status="running"
      />
    );
  if (task.status === 'scheduled')
    return (
      <Clock
        className={styles.statusIcon}
        data-status="scheduled"
      />
    );
  if (task.status === 'stopped')
    return (
      <Square
        className={styles.statusIcon}
        data-status="stopped"
      />
    );
  if (task.status === 'disabled')
    return (
      <XCircle
        className={styles.statusIcon}
        data-status="disabled"
      />
    );
  return <CheckCircle className={styles.statusIcon} />;
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
          <TableRow key={task.id}>
            <TableCell>
              <div className={styles.taskCell}>
                {getStatusIcon(task)}
                <div>
                  <div className={styles.taskName}>{task.name}</div>
                  <div className={styles.taskDescription}>{task.description}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge>
            </TableCell>
            <TableCell>
              <code className={styles.functionCode}>{task.taskFunction}</code>
            </TableCell>
            <TableCell>
              <code className={styles.scheduleCode}>{task.cronExpression}</code>
            </TableCell>
            <TableCell>
              {task.nextExecution ? (
                <span className={styles.nextRun}>{new Date(task.nextExecution).toLocaleString()}</span>
              ) : (
                <span className={styles.placeholder}>-</span>
              )}
            </TableCell>
            <TableCell>
              <div className={styles.lastExecution}>
                {getLastExecutionBadge(task)}
                {task.lastExecution && (
                  <span className={styles.lastExecutionTime}>{new Date(task.lastExecution.startedAt).toLocaleString()}</span>
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
