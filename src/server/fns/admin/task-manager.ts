import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { TaskSyncService } from '@/libs/tasks/sync-service';
import { TaskManager } from '@/libs/tasks/task-manager';
import { appMiddleware } from '@/server/server-fn';

export const listManagerTasks = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    const tm = TaskManager.getInstance();
    const tasks = await tm.getAllTasksStatus();
    return tasks.map((t) => ({
      name: t.name,
      status: t.isRunning ? 'Running' : t.isScheduled ? 'Active' : t.enabled ? 'Stopped' : 'Disabled',
      nextExecutionTime: t.nextExecution?.toISOString() || null,
      lastExecutionTime: t.lastExecution?.startedAt?.toISOString() || null,
      lastExecutionResult: t.lastExecution ? { success: t.lastExecution.status === 'success', error: t.lastExecution.error } : null,
      isEnabled: t.enabled,
      isScheduled: t.isScheduled,
      isRunning: t.isRunning,
    }));
  });

const taskActionSchema = z.object({
  action: z.enum(['start', 'stop', 'execute', 'enable', 'disable']),
  taskName: z.string().min(1),
});

export const operateManagerTask = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(taskActionSchema)
  .handler(async ({ data }) => {
    const tm = TaskManager.getInstance();
    const tasks = await tm.getAllTasksStatus();
    const task = tasks.find((t) => t.name === data.taskName);
    if (!task) throw new Error(`Task '${data.taskName}' not found`);

    switch (data.action) {
      case 'start':
        await tm.startTask(task.id);
        break;
      case 'stop':
        tm.stopTask(task.id);
        break;
      case 'execute':
        await tm.executeTaskNow(task.id);
        break;
      case 'enable':
        await TaskSyncService.enableTask(task.id);
        break;
      case 'disable':
        await TaskSyncService.disableTask(task.id);
        break;
    }

    const updated = await tm.getTaskStatus(task.id);
    return { success: true, status: updated };
  });
