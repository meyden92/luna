import { createFileRoute } from '@tanstack/react-router';
import TaskExecutionLogs from '@/components/admin/tasks/TaskExecutionLogs';

export const Route = createFileRoute('/_admin/admin/tasks/logs')({
  head: () => ({ meta: [{ title: 'Task Execution Logs | LunaShare' }] }),
  component: TaskLogsPage,
});

function TaskLogsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Task Execution Logs</h1>
        <p className="text-muted-foreground mt-2">
          View detailed execution logs, performance metrics, and error tracking for all scheduled tasks.
        </p>
      </div>

      <TaskExecutionLogs />
    </div>
  );
}
