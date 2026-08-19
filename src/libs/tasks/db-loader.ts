import { parseCronExpression } from 'cron-schedule';
import {
  getTaskById,
  getTaskByName,
  listAllTasks,
  listEnabledTasks,
  setTaskLastExecutionAt,
  setTaskNextExecutionAt,
} from '@/db/queries/tasks';
import type { DatabaseTask, TaskWithStatus } from '@/types/tasks';
import { validateTaskFunction } from './task-functions';

export class DatabaseTaskLoader {
  static async loadEnabledTasks(): Promise<DatabaseTask[]> {
    try {
      const tasks = await listEnabledTasks();

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
      return await listAllTasks();
    } catch (error) {
      console.error('Failed to load all tasks from database:', error);
      throw error;
    }
  }

  static async loadTask(taskId: string): Promise<DatabaseTask | null> {
    try {
      return await getTaskById(taskId);
    } catch (error) {
      console.error(`Failed to load task ${taskId}:`, error);
      throw error;
    }
  }

  /** Name lookup is case-insensitive, as it was under the MariaDB collation. */
  static async loadTaskByName(name: string): Promise<DatabaseTask | null> {
    try {
      return await getTaskByName(name);
    } catch (error) {
      console.error(`Failed to load task '${name}':`, error);
      throw error;
    }
  }

  static async updateNextExecutionTime(taskId: string, nextExecution: Date): Promise<void> {
    try {
      await setTaskNextExecutionAt(taskId, nextExecution);
    } catch (error) {
      console.error(`Failed to update next execution time for task ${taskId}:`, error);
      throw error;
    }
  }

  static async updateLastExecutionTime(taskId: string): Promise<void> {
    try {
      await setTaskLastExecutionAt(taskId, new Date());
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
