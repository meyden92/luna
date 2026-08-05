import type { Prisma } from '@db/client';
import { isAbortError } from '@/libs/ai-generation-utils';
import prisma from '@/libs/prismadb';
import type { DatabaseTask, TaskExecutionContext, TaskExecutionLog, TaskExecutionResult, TaskStatus } from '@/types/tasks';
import { DatabaseTaskLoader } from './db-loader';
import { getTaskFunction } from './task-functions';

export class TaskExecutionService {
  /**
   * Execute a task and log the complete execution lifecycle
   */
  static async executeTask(task: DatabaseTask, context: TaskExecutionContext): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    const logs: TaskExecutionLog[] = [];
    let timeoutId: NodeJS.Timeout | undefined;
    let timedOut = false;
    let timeoutError: Error | undefined;
    let work: Promise<any> | undefined;

    const execution = await TaskExecutionService.createExecutionRecord(task.id, context);
    const executionId = execution.id;

    const log = (level: TaskExecutionLog['level'], message: string, data?: unknown) => {
      const logEntry: TaskExecutionLog = {
        level,
        message,
        timestamp: new Date(),
        data,
      };
      logs.push(logEntry);
      console.log(`[Task:${task.name}] ${level.toUpperCase()}: ${message}`, data || '');
    };

    try {
      log('info', 'Starting task execution', {
        taskId: task.id,
        taskName: task.name,
        triggeredBy: context.triggeredBy,
        executedBy: context.executedBy,
        args: context.args,
      });

      await TaskExecutionService.updateExecutionStatus(executionId, 'running', { logs });

      const taskFunction = getTaskFunction(task.taskFunction);
      if (!taskFunction) {
        throw new Error(`Task function '${task.taskFunction}' not found`);
      }

      const timeout = context.timeout || task.timeout || 120000; // 2 minutes default
      const abortController = new AbortController();
      const { promise: timeoutPromise, reject: rejectTimeout } = Promise.withResolvers<never>();

      timeoutId = setTimeout(() => {
        timedOut = true;
        timeoutError = new Error(`Task execution timed out after ${timeout}ms`);
        abortController.abort(timeoutError);
        rejectTimeout(timeoutError);
      }, timeout);

      log('info', 'Executing task function', {
        function: task.taskFunction,
        timeout: timeout,
      });

      work = Promise.resolve().then(() => taskFunction(...context.args, { signal: abortController.signal }));
      const result = await Promise.race([work, timeoutPromise]);

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const duration = Date.now() - startTime;

      log('info', `Task completed successfully in ${duration}ms`, { result });

      await TaskExecutionService.updateExecutionStatus(executionId, 'success', {
        result,
        logs,
        duration,
        completedAt: new Date(),
      });

      await DatabaseTaskLoader.updateLastExecutionTime(task.id);

      return {
        success: true,
        status: 'success',
        result,
        duration,
        logs,
      };
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const isTimeout = timedOut || error === timeoutError;
      if (isTimeout && work) {
        log('warn', 'Task timed out; waiting for task function to settle after abort');
        try {
          await work;
          log('warn', 'Task function settled after timeout without throwing an abort error');
        } catch (settledError) {
          if (!isAbortError(settledError)) {
            log('debug', 'Timed-out task function settled with an error after abort', {
              error: settledError instanceof Error ? settledError.stack : settledError,
            });
          }
        }
      }

      const duration = Date.now() - startTime;
      const errorMessage = isTimeout
        ? (timeoutError?.message ?? 'Task execution timed out')
        : error instanceof Error
          ? error.message
          : 'Unknown error';

      log('error', `Task execution failed: ${errorMessage}`, {
        error: error instanceof Error ? error.stack : error,
      });

      const status: TaskStatus = isTimeout ? 'timeout' : 'failed';
      const shouldRetry = task.retryCount < task.maxRetries;

      await TaskExecutionService.updateExecutionStatus(executionId, status, {
        error: errorMessage,
        logs,
        duration,
        completedAt: new Date(),
      });

      if (shouldRetry) {
        log('info', `Scheduling retry ${task.retryCount + 1}/${task.maxRetries}`);
        await TaskExecutionService.incrementRetryCount(task.id);
      }

      return {
        success: false,
        status,
        shouldRetry,
        error: errorMessage,
        duration,
        logs,
      };
    }
  }

  private static async createExecutionRecord(taskId: string, context: TaskExecutionContext) {
    return await prisma.taskExecution.create({
      data: {
        taskId,
        status: 'pending',
        triggeredBy: context.triggeredBy,
        executedBy: context.executedBy || null,
        logs: [],
        startedAt: new Date(),
      },
    });
  }

  private static async updateExecutionStatus(
    executionId: string,
    status: TaskStatus,
    data: {
      result?: any;
      error?: string;
      logs?: TaskExecutionLog[];
      duration?: number;
      completedAt?: Date;
    },
  ) {
    await prisma.taskExecution.update({
      where: { id: executionId },
      data: {
        status,
        result: data.result,
        error: data.error,
        logs: (data.logs || []) as unknown as Prisma.InputJsonValue,
        duration: data.duration,
        completedAt: data.completedAt,
      },
    });
  }

  static async incrementRetryCount(taskId: string) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        retryCount: {
          increment: 1,
        },
        updatedAt: new Date(),
      },
    });
  }

  static async resetRetryCount(taskId: string) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        retryCount: 0,
        updatedAt: new Date(),
      },
    });
  }

  static async getExecutionHistory(taskId: string, limit = 50, status?: TaskStatus, offset = 0) {
    const where: Prisma.TaskExecutionWhereInput = { taskId };
    if (status) {
      where.status = status;
    }

    return await prisma.taskExecution.findMany({
      where,
      orderBy: {
        startedAt: 'desc',
      },
      take: limit,
      skip: offset,
      include: {
        task: {
          select: {
            name: true,
            description: true,
          },
        },
        executedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  static async countExecutions(taskId: string, status?: TaskStatus) {
    const where: Prisma.TaskExecutionWhereInput = { taskId };
    if (status) {
      where.status = status;
    }
    return prisma.taskExecution.count({ where });
  }

  static async getTaskExecutionStats(taskId: string, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await prisma.taskExecution.groupBy({
      by: ['status'],
      where: {
        taskId,
        startedAt: {
          gte: startDate,
        },
      },
      _count: {
        status: true,
      },
    });

    const avgDuration = await prisma.taskExecution.aggregate({
      where: {
        taskId,
        status: 'success',
        startedAt: {
          gte: startDate,
        },
        duration: {
          not: null,
        },
      },
      _avg: {
        duration: true,
      },
    });

    return {
      stats: stats.reduce(
        (acc, stat) => {
          acc[stat.status as TaskStatus] = stat._count.status;
          return acc;
        },
        {} as Record<TaskStatus, number>,
      ),
      averageDuration: avgDuration._avg.duration || 0,
      totalExecutions: stats.reduce((sum, stat) => sum + stat._count.status, 0),
    };
  }

  static async cleanupOldExecutions(olderThanDays = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const deleted = await prisma.taskExecution.deleteMany({
      where: {
        startedAt: {
          lt: cutoffDate,
        },
      },
    });

    return deleted.count;
  }
}
