import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { file } from './files';

/**
 * AI generation domain (issue #30) — generation/editing model catalogs, their
 * dynamic field definitions, reusable field-value presets, template-driven
 * generations, and the global variables templates can reference.
 *
 * Same conventions as files.ts: physical columns are snake_case (issue #28),
 * Json -> jsonb, tinyint(1) -> boolean, varchar(191) -> text (issue #23).
 */

// Catalog of image-generation models (e.g. Flux, SDXL) available to users.
export const generationModel = pgTable(
  'generation_model',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    description: text('description'),
    apiModelName: text('api_model_name').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  },
  (t) => [index('generation_model_isActive_idx').on(t.isActive), index('generation_model_createdBy_idx').on(t.createdBy)],
);

// Dynamic field definitions (per generation model) driving the generation form UI.
export const modelField = pgTable(
  'model_field',
  {
    id: text('id').primaryKey(),
    modelId: text('model_id')
      .notNull()
      .references(() => generationModel.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    label: text('label').notNull(),
    type: text('type').notNull(),
    description: text('description'),
    isRequired: boolean('is_required').default(false).notNull(),
    defaultValue: text('default_value'),
    minValue: text('min_value'),
    maxValue: text('max_value'),
    step: text('step'),
    enumOptions: text('enum_options'),
    isReadonly: boolean('is_readonly').default(false).notNull(),
    isTextarea: boolean('is_textarea').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    isSlider: boolean('is_slider').default(false).notNull(),
    showCharCount: boolean('show_char_count').default(false).notNull(),
  },
  (t) => [index('model_field_modelId_idx').on(t.modelId)],
);

// Catalog of image-editing models (e.g. inpainting, upscaling).
export const editingModel = pgTable(
  'editing_model',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    description: text('description'),
    apiModelName: text('api_model_name').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    imageInputField: text('image_input_field').default('image_input').notNull(),
  },
  (t) => [index('editing_model_isActive_idx').on(t.isActive), index('editing_model_createdBy_idx').on(t.createdBy)],
);

// Dynamic field definitions (per editing model) driving the editing form UI.
export const editingModelField = pgTable(
  'editing_model_field',
  {
    id: text('id').primaryKey(),
    modelId: text('model_id')
      .notNull()
      .references(() => editingModel.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    label: text('label').notNull(),
    type: text('type').notNull(),
    description: text('description'),
    isRequired: boolean('is_required').default(false).notNull(),
    defaultValue: text('default_value'),
    minValue: text('min_value'),
    maxValue: text('max_value'),
    step: text('step'),
    enumOptions: text('enum_options'),
    isReadonly: boolean('is_readonly').default(false).notNull(),
    isTextarea: boolean('is_textarea').default(false).notNull(),
    isSlider: boolean('is_slider').default(false).notNull(),
    showCharCount: boolean('show_char_count').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('editing_model_field_modelId_idx').on(t.modelId)],
);

// Named variables (e.g. "style", "mood") templates can expose as extra prompt inputs.
export const globalVariable = pgTable('global_variable', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  label: text('label').notNull(),
  type: text('type').notNull(),
  description: text('description'),
  defaultValue: text('default_value'),
  options: jsonb('options'),
  required: boolean('required').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Reusable prompt templates users can fill in to produce a generation.
export const template = pgTable(
  'template',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    prompt: text('prompt').notNull(),
    inputImageCount: integer('input_image_count').default(1).notNull(),
    variables: jsonb('variables'),
    previewImages: text('preview_images'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    maxImageCount: integer('max_image_count').default(4).notNull(),
    minImageCount: integer('min_image_count').default(1).notNull(),
    editingModelId: text('editing_model_id').references(() => editingModel.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    editingModelFieldValues: jsonb('editing_model_field_values'),
  },
  (t) => [
    index('template_isActive_idx').on(t.isActive),
    index('template_createdBy_idx').on(t.createdBy),
    index('template_editingModelId_idx').on(t.editingModelId),
  ],
);

// A single user's run of a template, with the filled-in variables and its result.
export const templateGeneration = pgTable(
  'template_generation',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => template.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    variableValues: jsonb('variable_values').notNull(),
    finalPrompt: text('final_prompt').notNull(),
    resultFileId: text('result_file_id').references(() => file.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    status: text('status').default('success').notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    replicateId: text('replicate_id'),
    replicateStatus: text('replicate_status'),
    originalImageUrls: jsonb('original_image_urls'),
    customTitle: text('custom_title'),
  },
  (t) => [
    index('template_generation_templateId_idx').on(t.templateId),
    index('template_generation_userId_idx').on(t.userId),
    index('template_generation_createdAt_idx').on(t.createdAt),
    index('template_generation_status_idx').on(t.status),
    // MySQL's auto-created index backing the resultFileId FK; reproduced verbatim.
    index('template_generation_resultFileId_fkey').on(t.resultFileId),
  ],
);

// Join table attaching global variables to a template, with per-template overrides.
export const templateGlobalVariable = pgTable(
  'template_global_variable',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => template.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    globalVariableId: text('global_variable_id')
      .notNull()
      .references(() => globalVariable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    addedOptions: jsonb('added_options'),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    required: boolean('required'),
  },
  (t) => [
    uniqueIndex('template_global_variable_templateId_globalVariableId_key').on(t.templateId, t.globalVariableId),
    index('template_global_variable_templateId_idx').on(t.templateId),
    index('template_global_variable_globalVariableId_idx').on(t.globalVariableId),
  ],
);

// A single ad-hoc (non-template) generation or edit request and its result.
export const aiGeneration = pgTable(
  'ai_generation',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // Not a FK: points at either generation_model or editing_model depending on `kind`.
    modelId: text('model_id').notNull(),
    modelLabel: text('model_label').notNull(),
    prompt: text('prompt'),
    inputImageUrls: jsonb('input_image_urls'),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    result: jsonb('result'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('ai_generation_userId_kind_createdAt_idx').on(t.userId, t.kind, t.createdAt)],
);

// A saved set of field values for a given model, so a user can reuse a configuration.
export const imagePreset = pgTable(
  'image_preset',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // Not a FK: points at either generation_model or editing_model depending on usage.
    modelId: text('model_id').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    fieldValues: jsonb('field_values').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('image_preset_userId_modelId_idx').on(t.userId, t.modelId)],
);
