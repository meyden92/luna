import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { user } from './auth';
import type { JsonValue } from './json';

/**
 * Scheduled tasks and flow automation (issue #30).
 *
 * `task` / `task_execution` are the cron-driven job runner; `flow` / `flow_run`
 * are the graph-based automation engine. Both pairs follow the same shape:
 * a definition table and an execution-log table.
 *
 * `args`, `result`, `logs`, `graph` and `items` are `longtext CHECK (json_valid(...))`
 * in the dump -> `jsonb` (issue #23). `updatedAt` columns are `NOT NULL` with no
 * DB default, i.e. Prisma's `@updatedAt` applied at query level -> `.defaultNow().notNull()`,
 * same as the reference slice.
 *
 * Only columns backed by a named `CONSTRAINT ... FOREIGN KEY` in the dump get
 * `.references()`. `task_execution.triggeredBy`, `flow.ownerId` and
 * `flow_run.flowId` / `flow_run.ownerId` look like FKs by name but carry no
 * constraint in the source DDL, so none is added here.
 */
export const task = pgTable(
  'task',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    description: text('description').notNull(),
    cronExpression: text('cron_expression').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    args: jsonb('args').$type<JsonValue>(),
    lastExecutionAt: timestamp('last_execution_at', { withTimezone: true }),
    maxRetries: integer('max_retries').default(3).notNull(),
    nextExecutionAt: timestamp('next_execution_at', { withTimezone: true }),
    retryCount: integer('retry_count').default(0).notNull(),
    taskFunction: text('task_function').notNull(),
    timeout: integer('timeout').default(120000),
  },
  (t) => [
    // task_name_key in the dump; single-column UNIQUE KEY maps to .unique() with no custom name.
    index('task_enabled_nextExecutionAt_idx').on(t.enabled, t.nextExecutionAt),
    index('task_createdBy_fkey').on(t.createdBy),
  ],
);

export const taskExecution = pgTable(
  'task_execution',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    duration: integer('duration'),
    result: jsonb('result').$type<JsonValue>(),
    error: text('error'),
    logs: jsonb('logs').$type<JsonValue>(),
    triggeredBy: text('triggered_by').notNull(),
    executedBy: text('executed_by').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  },
  (t) => [
    index('task_execution_taskId_startedAt_idx').on(t.taskId, t.startedAt),
    index('task_execution_status_idx').on(t.status),
    index('task_execution_startedAt_idx').on(t.startedAt),
    index('task_execution_executedBy_fkey').on(t.executedBy),
  ],
);

export const flow = pgTable(
  'flow',
  {
    id: text('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    ownerId: text('owner_id').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    triggerType: varchar('trigger_type', { length: 40 }).notNull(),
    graph: jsonb('graph').$type<JsonValue>().notNull(),
    version: integer('version').default(1).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('flow_ownerId_triggerType_enabled_idx').on(t.ownerId, t.triggerType, t.enabled),
    index('flow_ownerId_isActive_idx').on(t.ownerId, t.isActive),
  ],
);

export const flowRun = pgTable(
  'flow_run',
  {
    id: text('id').primaryKey(),
    flowId: text('flow_id').notNull(),
    ownerId: text('owner_id').notNull(),
    status: varchar('status', { length: 32 }).default('pending').notNull(),
    triggeredBy: varchar('triggered_by', { length: 40 }).notNull(),
    items: jsonb('items').$type<JsonValue>(),
    logs: jsonb('logs').$type<JsonValue>(),
    error: text('error'),
    duration: integer('duration'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('flow_run_flowId_startedAt_idx').on(t.flowId, t.startedAt),
    index('flow_run_ownerId_startedAt_idx').on(t.ownerId, t.startedAt),
    index('flow_run_status_idx').on(t.status),
  ],
);
