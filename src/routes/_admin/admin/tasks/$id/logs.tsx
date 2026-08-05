import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import TaskExecutionLogs from '@/components/admin/tasks/TaskExecutionLogs';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/libs/query-keys';
import { getAdminTask } from '@/server/fns/admin/tasks';

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
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link
                to="/admin/tasks"
                className="flex items-center gap-2"
              />
            }
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Tasks
          </Button>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">{task.name} - Execution Logs</h1>
        <p className="text-muted-foreground mt-2">{task.description}</p>
        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          <span>
            Function: <code className="bg-muted px-1 py-0.5 rounded">{task.taskFunction}</code>
          </span>
          <span>
            Schedule: <code className="bg-muted px-1 py-0.5 rounded">{task.cronExpression}</code>
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
