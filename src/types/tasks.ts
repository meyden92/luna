import type { Task, TaskExecution } from '@db/client';

export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout';
export type TriggerType = 'schedule' | 'manual' | 'api' | 'retry';

export interface TaskFunctionContext {
  signal: AbortSignal;
}

export type TaskFunction<TArgs extends any[] = any[], TReturn = any> = (
  ...args: [...TArgs, TaskFunctionContext]
) => Promise<TReturn> | TReturn;

export interface TaskFunctionRegistry {
  [name: string]: TaskFunction;
}

export interface TaskExecutionContext {
  taskId: string;
  executionId: string;
  args: unknown[];
  timeout?: number;
  triggeredBy: TriggerType;
  executedBy?: string;
}

export interface TaskExecutionResult<T = any> {
  success: boolean;
  status: TaskStatus;
  shouldRetry?: boolean;
  result?: T;
  error?: string;
  duration: number;
  logs?: TaskExecutionLog[];
}

export interface DatabaseTask extends Task {
  executions?: TaskExecution[];
}

export interface TaskWithStatus extends DatabaseTask {
  status: 'running' | 'scheduled' | 'stopped' | 'disabled';
  nextExecution?: Date;
  lastExecution?: TaskExecution;
  isRunning: boolean;
  isScheduled: boolean;
}

export interface TaskFormData {
  name: string;
  description: string;
  cronExpression: string;
  taskFunction: string;
  args?: unknown[];
  enabled?: boolean;
  timeout?: number;
  maxRetries?: number;
}

export interface TaskExecutionLog {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: Date;
  data?: unknown;
}
