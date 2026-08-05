import type { Prisma } from '@db/client';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getNextExecutions, validateCronExpression } from '@/libs/cron-utils';
import prisma from '@/libs/prismadb';
import { DatabaseTaskLoader } from '@/libs/tasks/db-loader';
import { TaskExecutionService } from '@/libs/tasks/execution-service';
import { TaskSyncService } from '@/libs/tasks/sync-service';
import { getAvailableTaskFunctions } from '@/libs/tasks/task-functions';
import { TaskManager } from '@/libs/tasks/task-manager';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';
import type { TaskFormData, TaskStatus } from '@/types/tasks';

const taskSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  cronExpression: z.string().min(1),
  taskFunction: z.string().min(1),
  args: z.array(z.any()).optional(),
  enabled: z.boolean().optional().default(true),
  timeout: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).max(10).optional().default(3),
});

const updateTaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  cronExpression: z.string().min(1).optional(),
  taskFunction: z.string().min(1).optional(),
  args: z.array(z.any()).optional(),
  enabled: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
});

const bulkOperationSchema = z.object({
  operation: z.enum(['enable', 'disable', 'delete']),
  taskIds: z.array(z.string()).min(1),
});

const listTasksSchema = z.object({
  status: z.string().optional(),
  enabled: z.boolean().optional(),
});

const cronPreviewSchema = z.object({
  cronExpression: z.string().min(1),
  count: z.number().int().min(1).max(20).optional(),
});

const executionDirectionSchema = z.enum(['next', 'previous']);
const EXECUTION_CURSOR_SEPARATOR = '|';

type ExecutionCursor = {
  startedAt: Date;
  id: string;
};

function encodeExecutionCursor(execution: ExecutionCursor) {
  return `${execution.startedAt.toISOString()}${EXECUTION_CURSOR_SEPARATOR}${execution.id}`;
}

function parseExecutionCursor(cursor?: string): ExecutionCursor | null {
  if (!cursor) return null;

  const separatorIndex = cursor.indexOf(EXECUTION_CURSOR_SEPARATOR);
  if (separatorIndex === -1) throw new Error('Invalid execution cursor');

  const startedAt = new Date(cursor.slice(0, separatorIndex));
  const id = cursor.slice(separatorIndex + 1);
  if (Number.isNaN(startedAt.getTime()) || !id) throw new Error('Invalid execution cursor');

  return { startedAt, id };
}

function getExecutionCursorFilter(cursor: ExecutionCursor, direction: 'next' | 'previous'): Prisma.TaskExecutionWhereInput {
  if (direction === 'previous') {
    return {
      OR: [{ startedAt: { gt: cursor.startedAt } }, { startedAt: cursor.startedAt, id: { gt: cursor.id } }],
    };
  }

  return {
    OR: [{ startedAt: { lt: cursor.startedAt } }, { startedAt: cursor.startedAt, id: { lt: cursor.id } }],
  };
}

function applyExecutionCursor(
  where: Prisma.TaskExecutionWhereInput,
  cursor: ExecutionCursor | null,
  direction: 'next' | 'previous',
): Prisma.TaskExecutionWhereInput {
  return cursor ? { AND: [where, getExecutionCursorFilter(cursor, direction)] } : where;
}

function getExecutionOrderBy(direction: 'next' | 'previous'): Prisma.TaskExecutionOrderByWithRelationInput[] {
  return direction === 'previous' ? [{ startedAt: 'asc' }, { id: 'asc' }] : [{ startedAt: 'desc' }, { id: 'desc' }];
}

function buildExecutionPage<T extends ExecutionCursor>(
  rows: T[],
  limit: number,
  cursor: ExecutionCursor | null,
  direction: 'next' | 'previous',
) {
  const hasExtra = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const executions = direction === 'previous' ? pageRows.reverse() : pageRows;
  const firstExecution = executions[0];
  const lastExecution = executions[executions.length - 1];
  const hasMore = direction === 'previous' ? Boolean(cursor) : hasExtra;
  const hasPrevious = direction === 'previous' ? hasExtra : Boolean(cursor);

  return {
    executions,
    hasMore,
    hasPrevious,
    nextCursor: hasMore && lastExecution ? encodeExecutionCursor(lastExecution) : null,
    previousCursor: hasPrevious && firstExecution ? encodeExecutionCursor(firstExecution) : null,
  };
}

export const listAdminTasks = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(listTasksSchema)
  .handler(async ({ data }) => {
    let tasks = await DatabaseTaskLoader.loadAllTasks();
    if (data.enabled != null) tasks = tasks.filter((t) => t.enabled === data.enabled);

    const tm = TaskManager.getInstance();
    const tasksWithStatus = tasks.map((task) => {
      const { isRunning, isScheduled } = tm.getRuntimeFlags(task.id);
      return DatabaseTaskLoader.convertToTaskWithStatus(task, isRunning, isScheduled);
    });

    if (data.status && data.status !== 'all') {
      return tasksWithStatus.filter((t) => t.status === data.status);
    }
    return tasksWithStatus;
  });

export const previewCronSchedule = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(cronPreviewSchema)
  .handler(async ({ data }) => {
    const validation = validateCronExpression(data.cronExpression);
    const timeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    return {
      isValid: validation.isValid,
      error: validation.error,
      timeZone,
      nextExecutions: validation.isValid ? getNextExecutions(data.cronExpression, data.count ?? 5).map((date) => date.toISOString()) : [],
    };
  });

export const createAdminTask = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(taskSchema)
  .handler(async ({ data, context }) => {
    const available = getAvailableTaskFunctions();
    if (!available.includes(data.taskFunction)) throw new Error('Invalid task function');
    return TaskSyncService.createTask(data as TaskFormData, adminIdFromCtx(context));
  });

export const bulkUpdateTasks = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(bulkOperationSchema)
  .handler(async ({ data }) => {
    switch (data.operation) {
      case 'enable':
        return TaskSyncService.bulkUpdateTasksEnabled(data.taskIds, true);
      case 'disable':
        return TaskSyncService.bulkUpdateTasksEnabled(data.taskIds, false);
      case 'delete':
        return TaskSyncService.bulkDeleteTasks(data.taskIds);
    }
  });

export const getAdminTask = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const task = await DatabaseTaskLoader.loadTask(data.id);
    if (!task) throw new Error('Task not found');
    const tm = TaskManager.getInstance();
    return (await tm.getTaskStatus(data.id)) || DatabaseTaskLoader.convertToTaskWithStatus(task);
  });

export const updateAdminTask = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(updateTaskSchema)
  .handler(async ({ data }) => {
    if (data.taskFunction) {
      const available = getAvailableTaskFunctions();
      if (!available.includes(data.taskFunction)) throw new Error('Invalid task function');
    }
    const { id, ...rest } = data;
    return TaskSyncService.updateTask(id, rest as Partial<TaskFormData>);
  });

export const deleteAdminTask = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    await TaskSyncService.deleteTask(data.id);
    return { success: true };
  });

const taskOperationSchema = z.object({
  id: z.string().min(1),
  operation: z.enum(['enable', 'disable', 'execute']),
});

export const operateAdminTask = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(taskOperationSchema)
  .handler(async ({ data, context }) => {
    const tm = TaskManager.getInstance();
    switch (data.operation) {
      case 'enable': {
        const result = await TaskSyncService.enableTask(data.id);
        return (await tm.getTaskStatus(data.id)) || DatabaseTaskLoader.convertToTaskWithStatus(result);
      }
      case 'disable': {
        const result = await TaskSyncService.disableTask(data.id);
        return (await tm.getTaskStatus(data.id)) || DatabaseTaskLoader.convertToTaskWithStatus(result);
      }
      case 'execute': {
        const result = await TaskSyncService.executeTask(data.id, adminIdFromCtx(context));
        return { success: true, result };
      }
    }
  });

const taskLogsSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
  direction: executionDirectionSchema.optional(),
});

export const getTaskLogs = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(taskLogsSchema)
  .handler(async ({ data }) => {
    const limit = data.limit ?? 50;
    const status = data.status as TaskStatus | undefined;
    const direction = data.direction ?? 'next';
    const cursor = parseExecutionCursor(data.cursor);
    const where = applyExecutionCursor({ taskId: data.id, ...(status ? { status } : {}) }, cursor, direction);

    const [executions, stats] = await Promise.all([
      prisma.taskExecution.findMany({
        where,
        orderBy: getExecutionOrderBy(direction),
        take: limit + 1,
        include: {
          task: { select: { id: true, name: true, description: true } },
          executedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      TaskExecutionService.getTaskExecutionStats(data.id, 7),
    ]);
    const page = buildExecutionPage(executions, limit, cursor, direction);

    return {
      executions: page.executions,
      pagination: {
        limit,
        hasMore: page.hasMore,
        hasPrevious: page.hasPrevious,
        nextCursor: page.nextCursor,
        previousCursor: page.previousCursor,
      },
      stats: { ...stats, period: '7 days' },
    };
  });

const executionsListSchema = z.object({
  taskId: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
  direction: executionDirectionSchema.optional(),
});

export const listExecutions = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(executionsListSchema)
  .handler(async ({ data }) => {
    const limit = data.limit ?? 50;
    const status = data.status as TaskStatus | undefined;
    const direction = data.direction ?? 'next';
    const cursor = parseExecutionCursor(data.cursor);
    const baseWhere: Prisma.TaskExecutionWhereInput = {
      ...(data.taskId ? { taskId: data.taskId } : {}),
      ...(status ? { status } : {}),
    };
    const where = applyExecutionCursor(baseWhere, cursor, direction);
    const executions = await prisma.taskExecution.findMany({
      where,
      orderBy: getExecutionOrderBy(direction),
      take: limit + 1,
      include: {
        task: { select: { id: true, name: true, description: true, taskFunction: true } },
        executedByUser: { select: { id: true, name: true, email: true } },
      },
    });
    const page = buildExecutionPage(executions, limit, cursor, direction);

    return {
      executions: page.executions,
      pagination: {
        limit,
        hasMore: page.hasMore,
        hasPrevious: page.hasPrevious,
        nextCursor: page.nextCursor,
        previousCursor: page.previousCursor,
      },
    };
  });

export const cleanupExecutions = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ olderThanDays: z.number().int().min(1).max(365) }))
  .handler(async ({ data }) => {
    const deletedCount = await TaskExecutionService.cleanupOldExecutions(data.olderThanDays);
    return { success: true, deletedCount, message: `Deleted ${deletedCount} execution records older than ${data.olderThanDays} days` };
  });

export const getExecution = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const exec = await prisma.taskExecution.findUnique({
      where: { id: data.id },
      include: {
        task: { select: { id: true, name: true, description: true, taskFunction: true } },
        executedByUser: { select: { id: true, name: true, email: true } },
      },
    });
    if (!exec) throw new Error('Execution not found');
    return exec;
  });

export const listTaskFunctions = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    const available = getAvailableTaskFunctions();
    const meta = available.map((name) => {
      let description = '';
      const parameters: string[] = [];
      if (name === 'deleteExpiredCache') description = 'Removes cached images not accessed in the last 30 minutes from database and S3';
      else if (name === 'deleteExpiredSessions') description = 'Deletes expired Better Auth sessions from the database';
      else description = `Task function: ${name}`;
      return { name, description, parameters };
    });
    return { functions: meta, total: available.length };
  });

const allLogsSchema = z.object({
  taskId: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  direction: executionDirectionSchema.optional(),
  search: z.string().optional(),
  days: z.number().int().min(1).max(365).optional(),
});

export const getAllTaskLogs = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(allLogsSchema)
  .handler(async ({ data }) => {
    const limit = Math.min(data.limit ?? 20, 200);
    const days = data.days ?? 7;
    const direction = data.direction ?? 'next';
    const cursor = parseExecutionCursor(data.cursor);

    const where: Prisma.TaskExecutionWhereInput = { startedAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } };
    if (data.taskId) where.taskId = data.taskId;
    if (data.status) where.status = data.status;
    if (data.search) {
      where.OR = [{ task: { name: { contains: data.search } } }, { error: { contains: data.search } }];
    }

    const statsWhere = { ...where };
    delete statsWhere.OR;
    const [executions, statusStats, avg] = await Promise.all([
      prisma.taskExecution.findMany({
        where: applyExecutionCursor(where, cursor, direction),
        orderBy: getExecutionOrderBy(direction),
        take: limit + 1,
        include: {
          task: { select: { id: true, name: true, description: true, taskFunction: true } },
          executedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.taskExecution.groupBy({ by: ['status'], where: statsWhere, _count: { status: true } }),
      prisma.taskExecution.aggregate({
        where: { ...statsWhere, status: 'success', duration: { not: null } },
        _avg: { duration: true },
      }),
    ]);
    const page = buildExecutionPage(executions, limit, cursor, direction);

    const formatted = page.executions.map((e) => ({
      ...e,
      parsedLogs: e.logs ? (Array.isArray(e.logs) ? e.logs : []) : [],
      durationDisplay: e.duration
        ? e.duration > 60000
          ? `${Math.round(e.duration / 1000 / 60)}m ${Math.round((e.duration / 1000) % 60)}s`
          : `${Math.round(e.duration / 1000)}s`
        : null,
      resultSummary: e.result && typeof e.result === 'object' ? (e.result as any).summary || 'Task completed' : e.result || null,
      resultDetails: e.result && typeof e.result === 'object' ? (e.result as any).details || null : null,
    }));

    const statsTotal = statusStats.reduce((total, stat) => total + stat._count.status, 0);
    const successCount = statusStats.find((s) => s.status === 'success')?._count.status || 0;

    return {
      executions: formatted,
      pagination: {
        limit,
        hasMore: page.hasMore,
        hasPrevious: page.hasPrevious,
        nextCursor: page.nextCursor,
        previousCursor: page.previousCursor,
      },
      stats: {
        period: `${days} days`,
        total: statsTotal,
        byStatus: Object.fromEntries(statusStats.map((s) => [s.status, s._count.status])),
        averageDuration: Math.round(avg._avg.duration || 0),
        successRate: statsTotal > 0 ? Math.round((successCount / statsTotal) * 100) : 0,
      },
      filters: { taskId: data.taskId || null, status: data.status || null, search: data.search || null, days },
    };
  });

const statsSchema = z.object({ taskId: z.string().optional(), days: z.number().int().min(1).max(365).optional() });

export const getTaskStats = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(statsSchema)
  .handler(async ({ data }) => {
    const days = data.days ?? 30;
    if (data.taskId) {
      const task = await DatabaseTaskLoader.loadTask(data.taskId);
      if (!task) throw new Error('Task not found');
      const stats = await TaskExecutionService.getTaskExecutionStats(data.taskId, days);
      return { taskId: data.taskId, taskName: task.name, period: `${days} days`, ...stats };
    }

    const tm = TaskManager.getInstance();
    const allTasks = await DatabaseTaskLoader.loadAllTasks();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const execStats = await prisma.taskExecution.groupBy({
      by: ['status'],
      where: { startedAt: { gte: startDate } },
      _count: { status: true },
    });
    const total = execStats.reduce((s, e) => s + e._count.status, 0);
    const succ = execStats.find((e) => e.status === 'success')?._count.status || 0;
    const fail = execStats.find((e) => e.status === 'failed')?._count.status || 0;

    const avg = await prisma.taskExecution.aggregate({
      where: { status: 'success', startedAt: { gte: startDate }, duration: { not: null } },
      _avg: { duration: true },
    });

    const mostActive = await prisma.taskExecution.groupBy({
      by: ['taskId'],
      where: { startedAt: { gte: startDate } },
      _count: { taskId: true },
      orderBy: { _count: { taskId: 'desc' } },
      take: 5,
    });
    const taskDetails = await Promise.all(
      mostActive.map(async (s) => {
        const t = await DatabaseTaskLoader.loadTask(s.taskId);
        return { taskId: s.taskId, taskName: t?.name || 'Unknown', executionCount: s._count.taskId };
      }),
    );

    return {
      period: `${days} days`,
      overview: {
        totalTasks: allTasks.length,
        enabledTasks: allTasks.filter((t) => t.enabled).length,
        disabledTasks: allTasks.filter((t) => !t.enabled).length,
        runningTasks: tm.getRunningTaskCount(),
        scheduledTasks: tm.getScheduledTaskCount(),
      },
      executions: {
        total,
        successful: succ,
        failed: fail,
        successRate: total > 0 ? Math.round((succ / total) * 100) : 0,
        averageDuration: Math.round(avg._avg.duration || 0),
      },
      statusBreakdown: Object.fromEntries(execStats.map((s) => [s.status, s._count.status])),
      mostActiveTasks: taskDetails,
    };
  });
