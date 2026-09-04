import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, Power, PowerOff, Square, Zap } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { queryKeys } from '@/libs/query-keys';
import { listManagerTasks, operateManagerTask } from '@/server/fns/admin/task-manager';
import styles from './TaskManager.module.css';

interface TaskInfo {
  name: string;
  status: 'Running' | 'Active' | 'Stopped' | 'Disabled';
  nextExecutionTime: string | null;
  lastExecutionTime: string | null;
  lastExecutionResult: {
    success: boolean;
    error?: string;
  } | null;
  isEnabled: boolean;
  isScheduled: boolean;
  isRunning: boolean;
}

interface TaskActionPayload {
  taskName: string;
  action: 'start' | 'stop' | 'execute' | 'enable' | 'disable';
}

export default function TaskManagerList() {
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const queryClient = useQueryClient();

  const {
    data: tasks,
    isFetching,
    isLoading,
  } = useQuery({
    queryKey: queryKeys.adminTasks.manager,
    refetchInterval: 1000 * 30,
    queryFn: () => listManagerTasks() as Promise<TaskInfo[]>,
  });

  const taskMutation = useMutation({
    mutationFn: async ({ taskName, action }: TaskActionPayload) => {
      return operateManagerTask({ data: { taskName, action } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTasks.manager });
    },
    onError: (error) => {
      setErrorMessage(error.message);
      setErrorDialogOpen(true);
    },
  });

  const handleTaskAction = (e: React.MouseEvent, taskName: string, action: TaskActionPayload['action']) => {
    e.stopPropagation();
    taskMutation.mutate({ taskName, action });
  };

  const handleRowClick = (task: TaskInfo) => {
    if (task.lastExecutionResult && !task.lastExecutionResult.success) {
      setErrorMessage(task.lastExecutionResult.error || 'Unknown error occurred');
      setErrorDialogOpen(true);
    }
  };

  const getStatusBadgeVariant = (status: TaskInfo['status']) => {
    switch (status) {
      case 'Running':
        return 'default';
      case 'Active':
        return 'secondary';
      case 'Stopped':
        return 'outline';
      case 'Disabled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (task: TaskInfo) => {
    if (task.isRunning) return '🔄';
    if (task.isScheduled) return '⏰';
    if (task.isEnabled) return '⏸️';
    return '❌';
  };

  return (
    <Card className={styles.card}>
      <CardHeader className={styles.header}>
        <CardTitle>Tasks</CardTitle>
        {isFetching && !isLoading && (
          <Badge
            variant="outline"
            className={styles.updatingBadge}
          >
            <Loader2 className={styles.updatingSpinner} />
            Updating...
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className={styles.loading}>
            <Loader2 className={styles.loadingSpinner} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next Execution</TableHead>
                <TableHead>Last Execution</TableHead>
                <TableHead>Last Result</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks?.map((task) => (
                <TableRow
                  key={task.name}
                  onClick={() => handleRowClick(task)}
                  className={styles.row}
                  data-failed={!!task.lastExecutionResult && !task.lastExecutionResult.success}
                >
                  <TableCell className={styles.nameCell}>
                    <div className={styles.name}>
                      <span className={styles.statusGlyph}>{getStatusIcon(task)}</span>
                      {task.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge>
                  </TableCell>
                  <TableCell>{task.nextExecutionTime ? new Date(task.nextExecutionTime).toLocaleString() : 'N/A'}</TableCell>
                  <TableCell>{task.lastExecutionTime ? new Date(task.lastExecutionTime).toLocaleString() : 'N/A'}</TableCell>
                  <TableCell>
                    {task.lastExecutionResult ? (
                      <Badge variant={task.lastExecutionResult.success ? 'secondary' : 'destructive'}>
                        {task.lastExecutionResult.success ? 'Success' : 'Failed'}
                      </Badge>
                    ) : (
                      'N/A'
                    )}
                  </TableCell>
                  <TableCell>
                    <div className={styles.rowActions}>
                      {/* Start/Stop buttons */}
                      {task.isEnabled && !task.isScheduled && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Start Task"
                          onClick={(e) => handleTaskAction(e, task.name, 'start')}
                          disabled={taskMutation.isPending}
                        >
                          <Play />
                        </Button>
                      )}

                      {task.isScheduled && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Stop Task"
                          onClick={(e) => handleTaskAction(e, task.name, 'stop')}
                          disabled={taskMutation.isPending}
                        >
                          <Square />
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        title="Execute Now"
                        onClick={(e) => handleTaskAction(e, task.name, 'execute')}
                        disabled={taskMutation.isPending || task.isRunning}
                      >
                        <Zap />
                      </Button>

                      {task.isEnabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Disable Task"
                          onClick={(e) => handleTaskAction(e, task.name, 'disable')}
                          disabled={taskMutation.isPending}
                        >
                          <PowerOff />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Enable Task"
                          onClick={(e) => handleTaskAction(e, task.name, 'enable')}
                          disabled={taskMutation.isPending}
                        >
                          <Power />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Task Error</DialogTitle>
            <pre className={styles.errorText}>{errorMessage}</pre>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
