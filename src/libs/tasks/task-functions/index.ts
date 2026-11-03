import type { TaskFunction, TaskFunctionRegistry } from '@/types/tasks';
import { rescanImageDimensionsExecutor } from './rescan-image-dimensions';
import { pruneFileRenditionsExecutor } from './selected-feature-maintenance';
import { deleteExpiredSessionsExecutor } from './session-cleanup';
import { expireStudioOutputsExecutor } from './studio-output-expiry';
import { testLoggerTask } from './test-logger';
import { updateYtDlpExecutor } from './update-yt-dlp';

const taskFunctionRegistry: TaskFunctionRegistry = {
  testLogger: testLoggerTask,
  deleteExpiredSessions: deleteExpiredSessionsExecutor,
  pruneFileRenditions: pruneFileRenditionsExecutor,
  rescanImageDimensions: rescanImageDimensionsExecutor,
  updateYtDlp: updateYtDlpExecutor,
  expireStudioOutputs: expireStudioOutputsExecutor,
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
