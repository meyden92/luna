import { parseCronExpression } from 'cron-schedule';
import prisma from '@/libs/prismadb';
import type { DatabaseTask, TaskWithStatus } from '@/types/tasks';
import { validateTaskFunction } from './task-functions';

export class DatabaseTaskLoader {
  static async loadEnabledTasks(): Promise<DatabaseTask[]> {
    try {
      const tasks = await prisma.task.findMany({
        where: {
          enabled: true,
        },
        include: {
          executions: {
            orderBy: {
              startedAt: 'desc',
            },
            take: 1, // Get the most recent execution
          },
        },
      });

      // Validate that all task functions exist
      const validTasks = tasks.filter((task) => {
        if (!validateTaskFunction(task.taskFunction)) {
          console.warn(`⚠️ Task '${task.name}' references unknown function '${task.taskFunction}' - skipping`);
          return false;
        }
        return true;
      });

      return validTasks;
    } catch (error) {
      console.error('Failed to load tasks from database:', error);
      throw error;
    }
  }

  static async loadAllTasks(): Promise<DatabaseTask[]> {
    try {
      const tasks = await prisma.task.findMany({
        include: {
          executions: {
            orderBy: {
              startedAt: 'desc',
            },
            take: 5, // Get the 5 most recent executions for admin view
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return tasks;
    } catch (error) {
      console.error('Failed to load all tasks from database:', error);
      throw error;
    }
  }

  static async loadTask(taskId: string): Promise<DatabaseTask | null> {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          executions: {
            orderBy: {
              startedAt: 'desc',
            },
            take: 10,
          },
        },
      });

      return task;
    } catch (error) {
      console.error(`Failed to load task ${taskId}:`, error);
      throw error;
    }
  }

  static async loadTaskByName(name: string): Promise<DatabaseTask | null> {
    try {
      const task = await prisma.task.findUnique({
        where: { name },
        include: {
          executions: {
            orderBy: {
              startedAt: 'desc',
            },
            take: 5,
          },
        },
      });

      return task;
    } catch (error) {
      console.error(`Failed to load task '${name}':`, error);
      throw error;
    }
  }

  static async updateNextExecutionTime(taskId: string, nextExecution: Date): Promise<void> {
    try {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          nextExecutionAt: nextExecution,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`Failed to update next execution time for task ${taskId}:`, error);
      throw error;
    }
  }

  static async updateLastExecutionTime(taskId: string): Promise<void> {
    try {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          lastExecutionAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`Failed to update last execution time for task ${taskId}:`, error);
      throw error;
    }
  }

  static convertToTaskWithStatus(dbTask: DatabaseTask, isRunning = false, isScheduled = false): TaskWithStatus {
    // Calculate next execution time
    let nextExecution: Date | undefined;
    if (dbTask.enabled && dbTask.cronExpression) {
      try {
        const cron = parseCronExpression(dbTask.cronExpression);
        nextExecution = cron.getNextDate();
      } catch (_error) {
        console.warn(`Invalid cron expression for task '${dbTask.name}': ${dbTask.cronExpression}`);
      }
    }

    // Determine status
    let status: 'running' | 'scheduled' | 'stopped' | 'disabled' = 'disabled';
    if (!dbTask.enabled) {
      status = 'disabled';
    } else if (isRunning) {
      status = 'running';
    } else if (isScheduled) {
      status = 'scheduled';
    } else {
      status = 'stopped';
    }

    return {
      ...dbTask,
      status,
      nextExecution,
      lastExecution: dbTask.executions?.[0],
      isRunning,
      isScheduled,
    };
  }

  static async updateAllNextExecutionTimes(): Promise<void> {
    try {
      const enabledTasks = await DatabaseTaskLoader.loadEnabledTasks();

      const updatePromises = enabledTasks.map(async (task) => {
        try {
          const cron = parseCronExpression(task.cronExpression);
          const nextExecution = cron.getNextDate();

          await DatabaseTaskLoader.updateNextExecutionTime(task.id, nextExecution);
        } catch (error) {
          console.warn(`Failed to calculate next execution for task '${task.name}':`, error);
        }
      });

      await Promise.allSettled(updatePromises);
    } catch (error) {
      console.error('Failed to update next execution times:', error);
      throw error;
    }
  }
}
