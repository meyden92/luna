import type { Prisma } from '@db/client';
import { parseCronExpression } from 'cron-schedule';
import prisma from '@/libs/prismadb';
import type { DatabaseTask, TaskFormData } from '@/types/tasks';
import { DatabaseTaskLoader } from './db-loader';
import { TaskExecutionService } from './execution-service';
import { validateTaskFunction } from './task-functions';
import { TaskManager } from './task-manager';

export class TaskSyncService {
  /**
   * Create a new task in the database
   */
  static async createTask(data: TaskFormData, createdBy?: string | null): Promise<DatabaseTask> {
    // Validate task function
    if (!validateTaskFunction(data.taskFunction)) {
      throw new Error(`Invalid task function: ${data.taskFunction}`);
    }

    // Validate cron expression
    try {
      parseCronExpression(data.cronExpression);
    } catch (_error) {
      throw new Error(`Invalid cron expression: ${data.cronExpression}`);
    }

    try {
      // Calculate next execution time
      const cron = parseCronExpression(data.cronExpression);
      const nextExecutionAt = data.enabled ? cron.getNextDate() : null;

      const task = await prisma.task.create({
        data: {
          name: data.name,
          description: data.description,
          cronExpression: data.cronExpression,
          taskFunction: data.taskFunction,
          args: (data.args ?? undefined) as Prisma.InputJsonValue | undefined,
          enabled: data.enabled ?? true,
          timeout: data.timeout || 120000,
          maxRetries: data.maxRetries ?? 3,
          nextExecutionAt,
          createdBy: createdBy || null,
        },
        include: {
          executions: {
            orderBy: {
              startedAt: 'desc',
            },
            take: 5,
          },
        },
      });

      // If enabled, schedule the task in TaskManager
      if (task.enabled) {
        const taskManager = TaskManager.getInstance();
        await taskManager.enableTask(task.id);
      }

      console.log(`✅ Created task '${task.name}' (${task.id})`);
      return task;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throw new Error(`Task with name '${data.name}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Update an existing task
   */
  static async updateTask(taskId: string, data: Partial<TaskFormData>): Promise<DatabaseTask> {
    const existingTask = await DatabaseTaskLoader.loadTask(taskId);
    if (!existingTask) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Validate task function if provided
    if (data.taskFunction && !validateTaskFunction(data.taskFunction)) {
      throw new Error(`Invalid task function: ${data.taskFunction}`);
    }

    // Validate cron expression if provided
    if (data.cronExpression) {
      try {
        parseCronExpression(data.cronExpression);
      } catch (_error) {
        throw new Error(`Invalid cron expression: ${data.cronExpression}`);
      }
    }

    const taskManager = TaskManager.getInstance();

    try {
      // Calculate next execution time if cron or enabled status changed
      let nextExecutionAt = existingTask.nextExecutionAt;
      const cronExpression = data.cronExpression || existingTask.cronExpression;
      const enabled = data.enabled !== undefined ? data.enabled : existingTask.enabled;

      if (data.cronExpression || (data.enabled !== undefined && data.enabled !== existingTask.enabled)) {
        if (enabled) {
          const cron = parseCronExpression(cronExpression);
          nextExecutionAt = cron.getNextDate();
        } else {
          nextExecutionAt = null;
        }
      }

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description && { description: data.description }),
          ...(data.cronExpression && { cronExpression: data.cronExpression }),
          ...(data.taskFunction && { taskFunction: data.taskFunction }),
          ...(data.args !== undefined && { args: data.args as Prisma.InputJsonValue }),
          ...(data.enabled !== undefined && { enabled: data.enabled }),
          ...(data.timeout && { timeout: data.timeout }),
          ...(data.maxRetries !== undefined && { maxRetries: data.maxRetries }),
          nextExecutionAt,
          updatedAt: new Date(),
        },
        include: {
          executions: {
            orderBy: {
              startedAt: 'desc',
            },
            take: 5,
          },
        },
      });

      // Update task scheduling based on enabled status
      if (data.enabled !== undefined) {
        if (data.enabled) {
          await taskManager.enableTask(taskId);
        } else {
          await taskManager.disableTask(taskId);
        }
      } else if (data.cronExpression || data.taskFunction) {
        // If cron or function changed, restart the task if it was running
        await taskManager.disableTask(taskId);
        if (updatedTask.enabled) {
          await taskManager.enableTask(taskId);
        }
      }

      console.log(`✅ Updated task '${updatedTask.name}' (${taskId})`);
      return updatedTask;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throw new Error(`Task with name '${data.name}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Delete a task
   */
  static async deleteTask(taskId: string): Promise<void> {
    const existingTask = await DatabaseTaskLoader.loadTask(taskId);
    if (!existingTask) {
      throw new Error(`Task ${taskId} not found`);
    }

    const taskManager = TaskManager.getInstance();
    // Stop the task if it's running
    await taskManager.disableTask(taskId);

    // Delete from database (executions will be deleted via CASCADE)
    await prisma.task.delete({
      where: { id: taskId },
    });

    console.log(`✅ Deleted task '${existingTask.name}' (${taskId})`);
  }

  /**
   * Enable a task
   */
  static async enableTask(taskId: string): Promise<DatabaseTask> {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        enabled: true,
        updatedAt: new Date(),
      },
      include: {
        executions: {
          orderBy: {
            startedAt: 'desc',
          },
          take: 5,
        },
      },
    });

    // Calculate and update next execution time
    const cron = parseCronExpression(task.cronExpression);
    const nextExecutionAt = cron.getNextDate();

    await prisma.task.update({
      where: { id: taskId },
      data: { nextExecutionAt },
    });

    // Schedule in TaskManager
    const taskManager = TaskManager.getInstance();
    await taskManager.enableTask(taskId);

    console.log(`✅ Enabled task '${task.name}' (${taskId})`);
    return task;
  }

  /**
   * Disable a task
   */
  static async disableTask(taskId: string): Promise<DatabaseTask> {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        enabled: false,
        nextExecutionAt: null,
        updatedAt: new Date(),
      },
      include: {
        executions: {
          orderBy: {
            startedAt: 'desc',
          },
          take: 5,
        },
      },
    });

    // Unschedule from TaskManager
    const taskManager = TaskManager.getInstance();
    await taskManager.disableTask(taskId);

    console.log(`✅ Disabled task '${task.name}' (${taskId})`);
    return task;
  }

  /**
   * Manually execute a task
   */
  static async executeTask(taskId: string, executedBy?: string): Promise<any> {
    const taskManager = TaskManager.getInstance();
    return await taskManager.executeTaskNow(taskId, executedBy);
  }

  /**
   * Bulk enable/disable tasks
   */
  static async bulkUpdateTasksEnabled(taskIds: string[], enabled: boolean): Promise<{ updated: number; failed: string[] }> {
    const failed: string[] = [];
    let updated = 0;

    for (const taskId of taskIds) {
      try {
        if (enabled) {
          await TaskSyncService.enableTask(taskId);
        } else {
          await TaskSyncService.disableTask(taskId);
        }
        updated++;
      } catch (error) {
        failed.push(taskId);
        console.error(`Failed to ${enabled ? 'enable' : 'disable'} task ${taskId}:`, error);
      }
    }

    return { updated, failed };
  }

  /**
   * Bulk delete tasks
   */
  static async bulkDeleteTasks(taskIds: string[]): Promise<{ deleted: number; failed: string[] }> {
    const failed: string[] = [];
    let deleted = 0;

    for (const taskId of taskIds) {
      try {
        await TaskSyncService.deleteTask(taskId);
        deleted++;
      } catch (error) {
        failed.push(taskId);
        console.error(`Failed to delete task ${taskId}:`, error);
      }
    }

    return { deleted, failed };
  }

  /**
   * Import tasks from JSON
   */
  static async importTasks(tasks: TaskFormData[], createdBy?: string): Promise<{ imported: number; failed: string[] }> {
    const failed: string[] = [];
    let imported = 0;

    for (const taskData of tasks) {
      try {
        await TaskSyncService.createTask(taskData, createdBy);
        imported++;
      } catch (error) {
        failed.push(taskData.name);
        console.error(`Failed to import task '${taskData.name}':`, error);
      }
    }

    return { imported, failed };
  }

  /**
   * Export all tasks to JSON
   */
  static async exportTasks(): Promise<TaskFormData[]> {
    const tasks = await DatabaseTaskLoader.loadAllTasks();

    return tasks.map((task) => ({
      name: task.name,
      description: task.description,
      cronExpression: task.cronExpression,
      taskFunction: task.taskFunction,
      args: task.args ? (Array.isArray(task.args) ? task.args : [task.args]) : undefined,
      enabled: task.enabled,
      timeout: task.timeout || undefined,
      maxRetries: task.maxRetries,
    }));
  }

  /**
   * Clean up old execution logs
   */
  static async cleanupExecutionLogs(olderThanDays = 90): Promise<number> {
    return await TaskExecutionService.cleanupOldExecutions(olderThanDays);
  }

  /**
   * Sync TaskManager with current database state
   */
  static async syncWithDatabase(): Promise<void> {
    const taskManager = TaskManager.getInstance();
    await taskManager.reloadTasks();
  }
}
