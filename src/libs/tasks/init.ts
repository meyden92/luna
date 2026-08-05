import { prismabase } from '@/libs/prismadb';
import { TaskManager } from './task-manager';

async function ensureDefaultTasks() {
  const defaults = [
    {
      name: 'delete-expired-sessions',
      description: 'Automatically removes expired Better Auth sessions from the database',
      cronExpression: '*/30 * * * *',
      taskFunction: 'deleteExpiredSessions',
      timeout: 120000,
      maxRetries: 3,
      args: undefined,
    },
    {
      name: 'prune-file-renditions',
      description: 'Deletes stale transform-on-URL renditions from S3 and the database',
      cronExpression: '0 3 * * *',
      taskFunction: 'pruneFileRenditions',
      timeout: 300000,
      maxRetries: 3,
      args: [30],
    },
    {
      name: 'prune-raw-analytics',
      description: 'Deletes raw view and egress events after rollups have been retained',
      cronExpression: '30 3 * * *',
      taskFunction: 'pruneRawAnalytics',
      timeout: 300000,
      maxRetries: 3,
      args: [90],
    },
  ];

  for (const task of defaults) {
    await prismabase.task.upsert({
      where: { name: task.name },
      update: {
        description: task.description,
        cronExpression: task.cronExpression,
        taskFunction: task.taskFunction,
        enabled: true,
        timeout: task.timeout,
        maxRetries: task.maxRetries,
        args: task.args,
        updatedAt: new Date(),
      },
      create: {
        name: task.name,
        description: task.description,
        cronExpression: task.cronExpression,
        taskFunction: task.taskFunction,
        enabled: true,
        timeout: task.timeout,
        maxRetries: task.maxRetries,
        args: task.args,
      },
    });
  }
}

export async function initializeTasks() {
  try {
    await ensureDefaultTasks();

    // Initialize the task manager with database tasks
    const taskManager = TaskManager.getInstance();
    await taskManager.initialize();

    console.info('✅ TaskManager initialized successfully with database tasks');
  } catch (error) {
    console.error('❌ Failed to initialize TaskManager:', error);
    throw error;
  }
}
