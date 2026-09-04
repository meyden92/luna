import { Link } from '@tanstack/react-router';
import { Edit, FileText, MoreHorizontal, Power, PowerOff, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { operateAdminTask } from '@/server/fns/admin/tasks';
import type { TaskWithStatus } from '@/types/tasks';
import styles from './task-actions.module.css';

interface TaskActionsProps {
  task: TaskWithStatus;
  onEdit: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

export default function TaskActions({ task, onEdit, onDelete }: TaskActionsProps) {
  const operationMutation = useAppMutation(operateAdminTask, {
    invalidates: [queryKeys.adminTasks.all],
    onSuccess: (_, { operation }) => {
      const actionMap = {
        enable: 'enabled',
        disable: 'disabled',
        execute: 'executed',
      };
      toast.success(`Task ${actionMap[operation as keyof typeof actionMap] || operation} successfully`);
    },
  });

  const handleOperation = (operation: 'enable' | 'disable' | 'execute') => {
    operationMutation.mutate({ id: task.id, operation });
  };

  return (
    <div className={styles.root}>
      {/* Quick actions */}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => handleOperation('execute')}
        disabled={operationMutation.isPending || task.isRunning}
        title="Execute Now"
      >
        <Zap />
      </Button>

      {task.enabled ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleOperation('disable')}
          disabled={operationMutation.isPending}
          title="Disable Task"
        >
          <PowerOff />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleOperation('enable')}
          disabled={operationMutation.isPending}
          title="Enable Task"
        >
          <Power />
        </Button>
      )}

      {/* More actions dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(task.id)}>
            <Edit />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Link
              to="/admin/tasks/$id/logs"
              params={{ id: String(task.id) }}
            >
              <FileText />
              View Logs
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(task.id)}
            className={styles.destructiveItem}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
