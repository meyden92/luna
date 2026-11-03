import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import type {
  FieldConfig,
  FileRef,
  GenerationError,
  GenerationProgress,
  GenerationStatus,
  MediaKind,
  SchemaSnapshot,
  StudioPricing,
  VariableConfig,
} from '../../libs/studio/types';
import { user } from './auth';
import { file } from './files';
import type { JsonValue } from './json';

/**
 * The Studio: Categories, Models and Templates curated by admins,
 * and the Generations Users run on fal with their Outputs.
 *
 * Costs are USD in `numeric`, read as numbers. Category, Model, Template,
 * settings and Budget overrides are audited; Generations and Outputs are not,
 * because their prompts are private (see UNAUDITED_MODELS).
 */

export const studioCategory = pgTable('studio_category', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // A lucide-react icon name from the curated list in the admin UI.
  icon: text('icon').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const studioModel = pgTable(
  'studio_model',
  {
    id: text('id').primaryKey(),
    // Restrict: a Category that still holds Models cannot be deleted.
    categoryId: text('category_id')
      .notNull()
      .references(() => studioCategory.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // Several Models may share one fal endpoint with different Field configs.
    endpointId: text('endpoint_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    schemaSnapshot: jsonb('schema_snapshot').$type<SchemaSnapshot>().notNull(),
    schemaCheckedAt: timestamp('schema_checked_at', { withTimezone: true }),
    // fal's current schema, set only while it differs from the snapshot.
    pendingSchema: jsonb('pending_schema').$type<SchemaSnapshot>(),
    deprecated: boolean('deprecated').default(false).notNull(),
    fields: jsonb('fields').$type<FieldConfig[]>().default([]).notNull(),
    pricing: jsonb('pricing').$type<StudioPricing>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('studio_model_categoryId_idx').on(t.categoryId)],
);

export const studioTemplate = pgTable(
  'studio_template',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => studioCategory.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    modelId: text('model_id')
      .notNull()
      .references(() => studioModel.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    fields: jsonb('fields').$type<FieldConfig[]>().default([]).notNull(),
    variables: jsonb('variables').$type<VariableConfig[]>().default([]).notNull(),
    // S3 keys of preview images. Owned by the Template, counted against no quota.
    previewKeys: jsonb('preview_keys').$type<string[]>().default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('studio_template_categoryId_idx').on(t.categoryId), index('studio_template_modelId_idx').on(t.modelId)],
);

export const generation = pgTable(
  'generation',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    modelId: text('model_id').references(() => studioModel.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    templateId: text('template_id').references(() => studioTemplate.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    // Snapshots, so the history still reads right after the Model or Template is gone.
    name: text('name').notNull(),
    endpointId: text('endpoint_id').notNull(),
    // What the User entered, for *Use settings*, *Again* and *Retry*.
    formValues: jsonb('form_values').$type<Record<string, JsonValue | FileRef | FileRef[]>>().notNull(),
    // The exact input sent to fal; null until the request is submitted.
    requestInput: jsonb('request_input').$type<Record<string, JsonValue>>(),
    falRequestId: text('fal_request_id'),
    statusUrl: text('status_url'),
    responseUrl: text('response_url'),
    cancelUrl: text('cancel_url'),
    status: varchar('status', { length: 16 }).$type<GenerationStatus>().default('queued').notNull(),
    progress: jsonb('progress').$type<GenerationProgress>(),
    error: jsonb('error').$type<GenerationError>(),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6, mode: 'number' }),
    actualCostUsd: numeric('actual_cost_usd', { precision: 12, scale: 6, mode: 'number' }),
    costSettledAt: timestamp('cost_settled_at', { withTimezone: true }),
    // Null while finished and unseen: drives the Studio nav badge.
    seenAt: timestamp('seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    // Also null for a cancelled Generation whose request fal may still finish.
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('generation_userId_createdAt_idx').on(t.userId, t.createdAt),
    index('generation_status_idx').on(t.status),
    index('generation_modelId_idx').on(t.modelId),
    index('generation_templateId_idx').on(t.templateId),
    uniqueIndex('generation_falRequestId_key').on(t.falRequestId),
  ],
);

export const generationOutput = pgTable(
  'generation_output',
  {
    id: text('id').primaryKey(),
    generationId: text('generation_id')
      .notNull()
      .references(() => generation.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    index: integer('index').notNull(),
    mediaKind: varchar('media_kind', { length: 16 }).$type<MediaKind>().notNull(),
    contentType: text('content_type').notNull(),
    // Private object: `studio/<userId>/<generationId>/<index>.<ext>`, or the
    // file's key once saved to Files.
    s3Key: text('s3_key').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: doublePrecision('duration_seconds'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Set by the expiry sweep once the object is deleted. The row stays.
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    savedFileId: text('saved_file_id').references(() => file.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('generation_output_generationId_index_key').on(t.generationId, t.index),
    index('generation_output_expiresAt_idx').on(t.expiresAt),
    index('generation_output_savedFileId_idx').on(t.savedFileId),
  ],
);

/** A single row, created on first write (see `src/db/queries/studio.ts`). */
export const studioSettings = pgTable('studio_settings', {
  id: text('id').primaryKey(),
  // Null means unlimited.
  defaultMonthlyBudgetUsd: numeric('default_monthly_budget_usd', { precision: 12, scale: 2, mode: 'number' }),
  maxActiveGenerationsPerUser: integer('max_active_generations_per_user').default(3).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** A User's own monthly Budget in place of the default. */
export const studioBudgetOverride = pgTable('studio_budget_override', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // Null means unlimited.
  monthlyBudgetUsd: numeric('monthly_budget_usd', { precision: 12, scale: 2, mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
