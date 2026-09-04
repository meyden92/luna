import { createFileRoute } from '@tanstack/react-router';
import TaskExecutionLogs from '@/components/admin/tasks/TaskExecutionLogs';
import { cn } from '@/libs/utils';
import styles from './logs.module.css';

export const Route = createFileRoute('/_admin/admin/tasks/logs')({
  head: () => ({ meta: [{ title: 'Task Execution Logs | LunaShare' }] }),
  component: TaskLogsPage,
});

function TaskLogsPage() {
  return (
    <div className="container pad-y-8">
      <div className="margin-bottom-8">
        <h1 className="type-3xl weight-bold">Task Execution Logs</h1>
        <p className={cn(styles.subtitle, 'type-base margin-top-2')}>
          View detailed execution logs, performance metrics, and error tracking for all scheduled tasks.
        </p>
      </div>

      <TaskExecutionLogs />
    </div>
  );
}
