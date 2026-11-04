import { createTask, getTaskByName, updateTaskDefinition } from '@/db/queries/tasks';
import type { JsonValue } from '@/db/schema/json';
import { TaskManager } from './task-manager';

type DefaultTask = {
  name: string;
  description: string;
  cronExpression: string;
  taskFunction: string;
  timeout: number;
  maxRetries: number;
  args?: JsonValue;
};

// Also run once at boot by the `init-tasks` Nitro plugin.
export const UPDATE_YT_DLP_TASK_NAME = 'Update yt-dlp';

const DEFAULT_TASKS: DefaultTask[] = [
  {
    name: 'delete-expired-sessions',
    description: 'Automatically removes expired Better Auth sessions from the database',
    cronExpression: '*/30 * * * *',
    taskFunction: 'deleteExpiredSessions',
    timeout: 120000,
    maxRetries: 3,
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
    name: UPDATE_YT_DLP_TASK_NAME,
    description: 'Updates the yt-dlp binary in place so Downloads survive Source changes without a redeploy (ADR 0007)',
    cronExpression: '0 4 * * *',
    taskFunction: 'updateYtDlp',
    timeout: 300000,
    // The next daily run, or "Run now" from Tasks, is the retry.
    maxRetries: 0,
  },
  {
    name: 'expire-studio-outputs',
    description: 'Deletes the stored media of Studio Outputs that expired unsaved; the history entries stay',
    cronExpression: '0 * * * *',
    taskFunction: 'expireStudioOutputs',
    timeout: 300000,
    maxRetries: 3,
  },
  {
    name: 'settle-studio-costs',
    description: "Replaces Studio cost estimates with fal's billed amounts, or books the estimate when fal reports none",
    cronExpression: '*/10 * * * *',
    taskFunction: 'settleStudioCosts',
    timeout: 300000,
    maxRetries: 3,
  },
  {
    name: 'check-studio-schemas',
    description: "Compares each Studio Model's schema snapshot with fal's current schema and flags changed or deprecated Models",
    cronExpression: '0 5 * * *',
    taskFunction: 'checkStudioSchemas',
    timeout: 300000,
    maxRetries: 3,
  },
];

/**
 * Brings the built-in tasks into line with the definitions above.
 *
 * The row is only written when something actually differs. This runs on every
 * boot, and `Task` is audited — an unconditional update would file an audit
 * entry per restart recording that nothing changed.
 */
async function ensureDefaultTasks() {
  for (const definition of DEFAULT_TASKS) {
    const { args, ...fields } = definition;
    const existing = await getTaskByName(definition.name);

    if (!existing) {
      await createTask({ ...fields, args: args ?? null, enabled: true }, null);
      continue;
    }

    const changed =
      existing.description !== fields.description ||
      existing.cronExpression !== fields.cronExpression ||
      existing.taskFunction !== fields.taskFunction ||
      existing.timeout !== fields.timeout ||
      existing.maxRetries !== fields.maxRetries ||
      !existing.enabled ||
      (args !== undefined && JSON.stringify(existing.args) !== JSON.stringify(args));

    // `args` is only written when the definition carries one, matching Prisma's
    // "undefined means leave it alone" update semantics.
    if (changed) await updateTaskDefinition(existing.id, { ...fields, ...(args === undefined ? {} : { args }), enabled: true }, null);
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
