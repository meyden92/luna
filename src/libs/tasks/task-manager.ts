import { parseCronExpression } from 'cron-schedule';
import { TimerBasedCronScheduler as scheduler } from 'cron-schedule/schedulers/timer-based.js';
import type { DatabaseTask, TaskExecutionContext, TaskExecutionResult, TaskWithStatus, TriggerType } from '@/types/tasks';
import { DatabaseTaskLoader } from './db-loader';
import { TaskExecutionService } from './execution-service';
import { getTaskFunction } from './task-functions';

declare global {
  var taskManager: TaskManager;
}

interface ScheduledTask {
  taskId: string;
  name: string;
  intervalId: ReturnType<typeof scheduler.setInterval> | null;
  isRunning: boolean;
  cron: ReturnType<typeof parseCronExpression>;
}

const SHUTDOWN_GRACE_MS = 30_000;
const SHUTDOWN_POLL_MS = 250;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 60_000;

export class TaskManager {
  private scheduledTasks = new Map<string, ScheduledTask>();
  private runningTaskIds = new Set<string>();
  private isShuttingDown = false;

  private constructor() {
    this.setupGracefulShutdown();
  }

  public static getInstance(): TaskManager {
    if (!global.taskManager) {
      console.log('Creating new TaskManager instance');
      global.taskManager = new TaskManager();
    }
    return global.taskManager;
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: NodeJS.Signals) => {
      if (this.isShuttingDown) {
        return;
      }

      console.log(`TaskManager: Graceful shutdown initiated (${signal})`);
      this.isShuttingDown = true;
      this.disarmScheduledTaskTimers();

      try {
        await this.drainRunningTasks();
      } finally {
        this.scheduledTasks.clear();
        process.exit(0);
      }
    };

    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
  }

  public async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing TaskManager with database tasks...');

      const tasks = await DatabaseTaskLoader.loadEnabledTasks();
      console.log(`📋 Found ${tasks.length} enabled tasks in database`);

      for (const task of tasks) {
        await this.scheduleTask(task);
      }

      await DatabaseTaskLoader.updateAllNextExecutionTimes();

      console.log('✅ TaskManager initialized successfully');
      // this.listTasks();
    } catch (error) {
      console.error('❌ Failed to initialize TaskManager:', error);
      throw error;
    }
  }

  private async scheduleTask(task: DatabaseTask): Promise<void> {
    if (this.isShuttingDown) {
      console.log(`Task '${task.name}' was not scheduled because shutdown is in progress`);
      return;
    }

    if (this.scheduledTasks.has(task.id)) {
      console.log(`Task '${task.name}' is already scheduled`);
      return;
    }

    const taskFunction = getTaskFunction(task.taskFunction);
    if (!taskFunction) {
      console.error(`❌ Task '${task.name}' references unknown function '${task.taskFunction}' - skipping`);
      return;
    }

    try {
      const cron = parseCronExpression(task.cronExpression);

      const scheduledTask: ScheduledTask = {
        taskId: task.id,
        name: task.name,
        intervalId: null,
        isRunning: false,
        cron,
      };

      scheduledTask.intervalId = scheduler.setInterval(cron, async () => {
        if (this.isShuttingDown || this.isTaskRunning(task.id)) {
          return;
        }

        await this.executeScheduledTask(task.id);
      });

      this.scheduledTasks.set(task.id, scheduledTask);

      console.log(`✓ Task '${task.name}' scheduled with cron: ${task.cronExpression}`);
      console.log(`  Next execution: ${cron.getNextDate().toLocaleString()}`);
    } catch (error) {
      console.error(`❌ Failed to schedule task '${task.name}':`, error);
    }
  }

  private async executeScheduledTask(taskId: string): Promise<void> {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (!scheduledTask) {
      console.error(`Scheduled task ${taskId} not found`);
      return;
    }

    if (this.isShuttingDown || this.isTaskRunning(taskId)) {
      return;
    }

    this.markTaskRunning(taskId);

    try {
      const task = await DatabaseTaskLoader.loadTask(taskId);
      if (!task) {
        console.error(`Task ${taskId} not found in database`);
        return;
      }

      if (this.isShuttingDown) {
        return;
      }

      if (!task.enabled) {
        console.log(`Task '${task.name}' is disabled, stopping scheduler`);
        this.unscheduleTask(taskId);
        return;
      }

      const context: TaskExecutionContext = {
        taskId: task.id,
        executionId: '', // Will be set by execution service
        args: task.args ? (Array.isArray(task.args) ? task.args : [task.args]) : [],
        timeout: task.timeout || undefined,
        triggeredBy: 'schedule',
      };

      await this.executeLoadedTask(task, context);
    } catch (error) {
      console.error(`Failed to execute scheduled task '${scheduledTask.name}':`, error);
    } finally {
      this.unmarkTaskRunning(taskId);
    }
  }

  public async startTask(taskId: string): Promise<void> {
    const task = await DatabaseTaskLoader.loadTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (!task.enabled) {
      throw new Error(`Task '${task.name}' is disabled`);
    }

    if (this.scheduledTasks.has(taskId)) {
      console.log(`Task '${task.name}' is already scheduled`);
      return;
    }

    await this.scheduleTask(task);
  }

  public stopTask(taskId: string): void {
    this.unscheduleTask(taskId);
  }

  private unscheduleTask(taskId: string): void {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (!scheduledTask) {
      return;
    }

    if (scheduledTask.intervalId) {
      scheduler.clearTimeoutOrInterval(scheduledTask.intervalId);
    }

    this.scheduledTasks.delete(taskId);
    console.log(`✓ Task '${scheduledTask.name}' unscheduled`);
  }

  public async executeTaskNow(taskId: string, executedBy?: string): Promise<any> {
    const result = await this.executeTaskForTrigger(taskId, executedBy ? 'manual' : 'api', executedBy);
    return result.result;
  }

  private async executeTaskForTrigger(taskId: string, triggeredBy: TriggerType, executedBy?: string): Promise<TaskExecutionResult> {
    if (this.isShuttingDown) {
      throw new Error('Task manager is shutting down');
    }

    if (this.isTaskRunning(taskId)) {
      throw new Error(`Task ${taskId} is already running`);
    }

    this.markTaskRunning(taskId);

    try {
      const task = await DatabaseTaskLoader.loadTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (this.isShuttingDown) {
        throw new Error('Task manager is shutting down');
      }

      const context: TaskExecutionContext = {
        taskId: task.id,
        executionId: '', // Will be set by execution service
        args: task.args ? (Array.isArray(task.args) ? task.args : [task.args]) : [],
        timeout: task.timeout || undefined,
        triggeredBy,
        executedBy,
      };

      return await this.executeLoadedTask(task, context);
    } finally {
      this.unmarkTaskRunning(taskId);
    }
  }

  public async enableTask(taskId: string): Promise<void> {
    const task = await DatabaseTaskLoader.loadTask(taskId);
    if (task?.enabled && !this.scheduledTasks.has(taskId)) {
      await this.scheduleTask(task);
    }
  }

  public async disableTask(taskId: string): Promise<void> {
    this.unscheduleTask(taskId);
  }

  /**
   * Reload tasks from database (useful after configuration changes)
   */
  public async reloadTasks(): Promise<void> {
    console.log('🔄 Reloading tasks from database...');

    this.stopAllTasks();
    await this.initialize();
  }

  public async getTaskStatus(taskId: string): Promise<TaskWithStatus | null> {
    const task = await DatabaseTaskLoader.loadTask(taskId);
    if (!task) {
      return null;
    }

    const { isRunning, isScheduled } = this.getRuntimeFlags(taskId);

    return DatabaseTaskLoader.convertToTaskWithStatus(task, isRunning, isScheduled);
  }

  public getRuntimeFlags(taskId: string): { isRunning: boolean; isScheduled: boolean } {
    const scheduledTask = this.scheduledTasks.get(taskId);
    return {
      isRunning: this.isTaskRunning(taskId),
      isScheduled: !!scheduledTask?.intervalId,
    };
  }

  public async getAllTasksStatus(): Promise<TaskWithStatus[]> {
    const tasks = await DatabaseTaskLoader.loadAllTasks();

    return tasks.map((task) => {
      const { isRunning, isScheduled } = this.getRuntimeFlags(task.id);

      return DatabaseTaskLoader.convertToTaskWithStatus(task, isRunning, isScheduled);
    });
  }

  public stopAllTasks(): void {
    console.log('Stopping all tasks...');
    this.disarmScheduledTaskTimers();
    this.scheduledTasks.clear();
  }

  private disarmScheduledTaskTimers(): void {
    for (const [_taskId, scheduledTask] of this.scheduledTasks) {
      if (scheduledTask.intervalId) {
        scheduler.clearTimeoutOrInterval(scheduledTask.intervalId);
        scheduledTask.intervalId = null;
      }
    }
  }

  private async drainRunningTasks(): Promise<void> {
    const deadline = Date.now() + SHUTDOWN_GRACE_MS;

    while (this.getRunningTaskCount() > 0 && Date.now() < deadline) {
      console.log(`TaskManager: waiting for ${this.getRunningTaskCount()} running task(s) to finish before shutdown`);
      await new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_POLL_MS));
    }

    const remainingTasks = this.getRunningTaskCount();
    if (remainingTasks > 0) {
      console.warn(`TaskManager: shutdown grace period elapsed with ${remainingTasks} task(s) still running`);
    }
  }

  private async executeLoadedTask(task: DatabaseTask, context: TaskExecutionContext): Promise<TaskExecutionResult> {
    let currentTask = task;
    let currentContext = context;

    while (true) {
      const result = await TaskExecutionService.executeTask(currentTask, currentContext);

      if (result.success) {
        await TaskExecutionService.resetRetryCount(currentTask.id);
        return result;
      }

      if (!result.shouldRetry || this.isShuttingDown) {
        if (!result.shouldRetry && currentTask.maxRetries > 0 && currentTask.retryCount >= currentTask.maxRetries) {
          await TaskExecutionService.resetRetryCount(currentTask.id);
        }
        return result;
      }

      const retryDelay = Math.min(2 ** currentTask.retryCount * RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS);
      console.log(`TaskManager: retrying '${currentTask.name}' in ${retryDelay}ms`);
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));

      if (this.isShuttingDown) {
        return result;
      }

      const reloadedTask = await DatabaseTaskLoader.loadTask(currentTask.id);
      if (!reloadedTask?.enabled) {
        return result;
      }

      currentTask = reloadedTask;
      currentContext = { ...context, triggeredBy: 'retry' };
    }
  }

  private markTaskRunning(taskId: string): void {
    this.runningTaskIds.add(taskId);

    const scheduledTask = this.scheduledTasks.get(taskId);
    if (scheduledTask) {
      scheduledTask.isRunning = true;
    }
  }

  private unmarkTaskRunning(taskId: string): void {
    this.runningTaskIds.delete(taskId);

    const scheduledTask = this.scheduledTasks.get(taskId);
    if (scheduledTask) {
      scheduledTask.isRunning = false;
    }
  }

  private isTaskRunning(taskId: string): boolean {
    return this.runningTaskIds.has(taskId);
  }

  public async listTasks(): Promise<void> {
    const tasks = await this.getAllTasksStatus();

    if (tasks.length === 0) {
      console.log('No tasks found in database');
      return;
    }

    console.log(`\n📋 Database Tasks (${tasks.length}):\n`);

    for (const task of tasks) {
      const statusIcon = task.isRunning ? '🔄' : task.isScheduled ? '⏰' : task.status === 'disabled' ? '❌' : '⏸️';

      console.log(`${statusIcon} ${task.name} (${task.id})`);
      console.log(`   Description: ${task.description}`);
      console.log(`   Function: ${task.taskFunction}`);
      console.log(`   Schedule: ${task.cronExpression}`);
      console.log(`   Status: ${task.status} | Enabled: ${task.enabled}`);

      if (task.nextExecution) {
        console.log(`   Next run: ${task.nextExecution.toLocaleString()}`);
      }

      if (task.lastExecution) {
        const lastExec = task.lastExecution;
        const resultIcon = lastExec.status === 'success' ? '✅' : '❌';
        console.log(`   Last run: ${resultIcon} ${lastExec.startedAt.toLocaleString()} (${lastExec.duration || 0}ms)`);
        if (lastExec.error) {
          console.log(`   Last error: ${lastExec.error}`);
        }
      }

      console.log('');
    }
  }

  public getRunningTaskCount(): number {
    return this.runningTaskIds.size;
  }

  public getScheduledTaskCount(): number {
    return Array.from(this.scheduledTasks.values()).filter((task) => task.intervalId !== null).length;
  }
}
