import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { deleteAdminTask, listAdminTasks } from '@/server/fns/admin/tasks';
import type { TaskWithStatus } from '@/types/tasks';
import SimpleTaskForm from './SimpleTaskForm';
import TaskFilters from './task-filters';
import TaskTableServer from './task-table-server';

type StatusFilter = 'all' | 'running' | 'scheduled' | 'stopped' | 'disabled';

export default function EnhancedTaskList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [deletingTask, setDeletingTask] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Fetch tasks
  const {
    data: tasks,
    isLoading,
    error,
  } = useQuery<TaskWithStatus[]>({
    queryKey: queryKeys.adminTasks.all,
    queryFn: async () => {
      return (await listAdminTasks({ data: {} })) as TaskWithStatus[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Task operations mutation

  // Delete mutation
  const deleteMutation = useAppMutation(deleteAdminTask, {
    invalidates: [queryKeys.adminTasks.all],
    successMessage: 'Task deleted successfully',
    onSuccess: () => setDeletingTask(null),
  });

  const handleDelete = () => {
    if (deletingTask) {
      deleteMutation.mutate({ id: deletingTask });
    }
  };

  // Filter tasks
  const filteredTasks =
    tasks?.filter((task) => {
      if (statusFilter === 'all') return true;
      return task.status === statusFilter;
    }) || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load tasks</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showCreateForm) {
    return (
      <SimpleTaskForm
        onSuccess={() => setShowCreateForm(false)}
        onCancel={() => setShowCreateForm(false)}
      />
    );
  }

  if (editingTask) {
    return (
      <SimpleTaskForm
        taskId={editingTask}
        onSuccess={() => setEditingTask(null)}
        onCancel={() => setEditingTask(null)}
      />
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Task Management
              {tasks && (
                <Badge variant="outline">
                  {filteredTasks.length} of {tasks.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <TaskFilters
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
              <Button
                variant="outline"
                render={<Link to="/admin/tasks/logs" />}
              >
                <FileText className="h-4 w-4 mr-2" />
                View All Logs
              </Button>
              <Button onClick={() => setShowCreateForm(true)}>Create Task</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{statusFilter === 'all' ? 'No tasks found' : `No ${statusFilter} tasks found`}</p>
              {statusFilter === 'all' && (
                <Button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4"
                >
                  Create Your First Task
                </Button>
              )}
            </div>
          ) : (
            <TaskTableServer
              tasks={filteredTasks}
              onEdit={setEditingTask}
              onDelete={setDeletingTask}
            />
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deletingTask}
        onOpenChange={(open) => !open && setDeletingTask(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this task? This action cannot be undone and will also delete all execution history.</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingTask(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
