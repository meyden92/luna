import type { TaskFunction, TaskFunctionRegistry } from '@/types/tasks';
// import { deleteExpiredCacheExecutor } from './cache-cleanup';
import { checkTemplateGenerationsExecutor } from './check-template-generations';
import { rescanImageDimensionsExecutor } from './rescan-image-dimensions';
import { pruneFileRenditionsExecutor, pruneRawAnalyticsExecutor } from './selected-feature-maintenance';
import { deleteExpiredSessionsExecutor } from './session-cleanup';
import { testLoggerTask } from './test-logger';

const taskFunctionRegistry: TaskFunctionRegistry = {
  // deleteExpiredCache: deleteExpiredCacheExecutor, // Disabled as per new manual purge policy
  testLogger: testLoggerTask,
  checkTemplateGenerations: checkTemplateGenerationsExecutor,
  deleteExpiredSessions: deleteExpiredSessionsExecutor,
  pruneFileRenditions: pruneFileRenditionsExecutor,
  pruneRawAnalytics: pruneRawAnalyticsExecutor,
  rescanImageDimensions: rescanImageDimensionsExecutor,
};

export function getTaskFunction(name: string): TaskFunction | undefined {
  return taskFunctionRegistry[name];
}

export function getAvailableTaskFunctions(): string[] {
  return Object.keys(taskFunctionRegistry);
}

export function validateTaskFunction(name: string): boolean {
  return name in taskFunctionRegistry;
}
