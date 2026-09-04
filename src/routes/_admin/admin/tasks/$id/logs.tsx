import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import TaskExecutionLogs from '@/components/admin/tasks/TaskExecutionLogs';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { getAdminTask } from '@/server/fns/admin/tasks';
import styles from './logs.module.css';

const taskQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.adminTasks.detail(id),
    queryFn: () => getAdminTask({ data: { id } }),
  });

export const Route = createFileRoute('/_admin/admin/tasks/$id/logs')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(taskQueryOptions(params.id));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Task Logs | LunaShare' }] }),
  component: TaskSpecificLogsPage,
});

function TaskSpecificLogsPage() {
  const { id } = Route.useParams();
  const { data: task } = useSuspenseQuery(taskQueryOptions(id));

  return (
    <div className="container pad-y-8">
      <div className="margin-bottom-8">
        <div className={styles.backRow}>
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link
                to="/admin/tasks"
                className={styles.backLink}
              />
            }
          >
            <ArrowLeftIcon className={styles.icon} />
            Back to Tasks
          </Button>
        </div>

        <h1 className="type-3xl weight-bold">{task.name} - Execution Logs</h1>
        <p className={cn(styles.subtitle, 'margin-top-2')}>{task.description}</p>
        <div className={cn(styles.metaRow, 'type-sm margin-top-3')}>
          <span>
            Function: <code className={styles.code}>{task.taskFunction}</code>
          </span>
          <span>
            Schedule: <code className={styles.code}>{task.cronExpression}</code>
          </span>
          <span>Status: {task.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>

      <TaskExecutionLogs
        taskId={id}
        showTaskColumn={false}
      />
    </div>
  );
}
