import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog, writeAuditLogs } from '../audit';
import { db, type Tx } from '../client';
import { cachedImage } from '../schema/admin';
import {
  aiGeneration,
  editingModel,
  editingModelField,
  generationModel,
  globalVariable,
  imagePreset,
  modelField,
  template,
  templateGeneration,
  templateGlobalVariable,
} from '../schema/ai';
import { file, fileMetadata } from '../schema/files';
import type { JsonValue } from '../schema/json';
import { ensureStorageQuotaAvailable } from './storage';

/**
 * Query module for AI generation, templates, model configuration and presets
 * (issues #15, #38). Same contract as the files and folders modules: call sites
 * import named functions, the `db` handle never leaves `src/db/`, the handle
 * comes last and defaults to this module's own `db`, and the audit call lives
 * inside the write function.
 *
 * All ten models this module owns — `AiGeneration`, `TemplateGeneration`,
 * `Template`, `TemplateGlobalVariable`, `GlobalVariable`, `GenerationModel`,
 * `ModelField`, `EditingModel`, `EditingModelField` and `ImagePreset` — are in
 * `AUDITED_MODELS`: they are direct records of deliberate tool use and of
 * configuration changes (#13). `CachedImage` is the one table here that is not,
 * being a derived artifact.
 *
 * Nested reads use the relational query API on the concrete `db` handle rather
 * than a `Db | Tx` union. The union widens jsonb columns back to `unknown`, and
 * TanStack Start then refuses to serialise the row across the server-function
 * boundary — the same failure `JsonValue` exists to prevent.
 */

// ---------------------------------------------------------------------------
// Model catalogs — generation and editing models with their dynamic fields
// ---------------------------------------------------------------------------

/** Field ordering is load-bearing: it is the order the generation form renders. */
const BY_SORT_ORDER = { sortOrder: 'asc' } as const;

/** Active generation models with their fields — the user-facing model picker. */
export function listActiveGenerationModels() {
  return db.query.generationModel.findMany({
    where: { isActive: true },
    with: { fields: { orderBy: BY_SORT_ORDER } },
    orderBy: BY_SORT_ORDER,
  });
}

/** Active editing models with their fields — the user-facing model picker. */
export function listActiveEditingModels() {
  return db.query.editingModel.findMany({
    where: { isActive: true },
    with: { fields: { orderBy: BY_SORT_ORDER } },
    orderBy: BY_SORT_ORDER,
  });
}

/** One active generation model with its fields — the image streaming endpoint. */
export function getActiveGenerationModel(id: string) {
  return db.query.generationModel.findFirst({
    where: { id, isActive: true },
    with: { fields: { orderBy: BY_SORT_ORDER } },
  });
}

/** One active editing model with its fields — the edit-image streaming endpoint. */
export function getActiveEditingModel(id: string) {
  return db.query.editingModel.findFirst({
    where: { id, isActive: true },
    with: { fields: { orderBy: BY_SORT_ORDER } },
  });
}

/** One editing model, active or not — the admin test-generate endpoint. */
export async function getEditingModelById(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(editingModel).where(eq(editingModel.id, id));
  return row;
}

/** Every generation model with its fields, for the admin manager. */
export function listGenerationModels() {
  return db.query.generationModel.findMany({
    with: { fields: { orderBy: BY_SORT_ORDER } },
    orderBy: { sortOrder: 'asc', label: 'asc' },
  });
}

/** Every editing model with its fields, for the admin manager. */
export function listEditingModels() {
  return db.query.editingModel.findMany({
    with: { fields: { orderBy: BY_SORT_ORDER } },
    orderBy: { sortOrder: 'asc', label: 'asc' },
  });
}

export function getGenerationModelWithFields(id: string) {
  return db.query.generationModel.findFirst({ where: { id }, with: { fields: { orderBy: BY_SORT_ORDER } } });
}

export function getEditingModelWithFields(id: string) {
  return db.query.editingModel.findFirst({ where: { id }, with: { fields: { orderBy: BY_SORT_ORDER } } });
}

/** The per-field values an admin form submits; ids are generated on insert. */
export type ModelFieldValues = {
  name: string;
  label: string;
  type: string;
  description?: string | null;
  isRequired: boolean;
  defaultValue?: string | null;
  minValue?: string | null;
  maxValue?: string | null;
  step?: string | null;
  enumOptions?: string | null;
  isReadonly: boolean;
  isTextarea?: boolean;
  isSlider?: boolean;
  showCharCount?: boolean;
  sortOrder: number;
};

type ModelValues = {
  label: string;
  description: string | null;
  apiModelName: string;
  isActive: boolean;
  sortOrder: number;
};

function fieldRow(modelId: string, values: ModelFieldValues) {
  return {
    id: crypto.randomUUID(),
    modelId,
    name: values.name,
    label: values.label,
    type: values.type,
    description: values.description ?? null,
    isRequired: values.isRequired,
    defaultValue: values.defaultValue ?? null,
    minValue: values.minValue ?? null,
    maxValue: values.maxValue ?? null,
    step: values.step ?? null,
    enumOptions: values.enumOptions ?? null,
    isReadonly: values.isReadonly,
    isTextarea: values.isTextarea ?? false,
    isSlider: values.isSlider ?? false,
    showCharCount: values.showCharCount ?? false,
    sortOrder: values.sortOrder,
  };
}

export async function createGenerationModel(
  { fields, createdBy, ...values }: ModelValues & { createdBy: string; fields: ModelFieldValues[] },
  userId: string | null,
) {
  return db.transaction(async (tx) => {
    const [model] = await tx
      .insert(generationModel)
      .values({ id: crypto.randomUUID(), createdBy, ...values })
      .returning();
    if (!model) throw new Error('Failed to create generation model');
    await writeAuditLog(tx, { model: 'GenerationModel', action: 'create', after: model, userId });

    const created =
      fields.length > 0
        ? await tx
            .insert(modelField)
            .values(fields.map((f) => fieldRow(model.id, f)))
            .returning()
        : [];
    await writeAuditLogs(
      tx,
      'ModelField',
      'create',
      created.map((after) => ({ after })),
      userId,
    );

    return { ...model, fields: created };
  });
}

/**
 * Replaces the model and its whole field set in one transaction, mirroring
 * Prisma's nested `deleteMany` + `create` — a failed update can no longer leave
 * the model without fields.
 */
export async function updateGenerationModel(
  { id, fields, ...values }: ModelValues & { id: string; fields: ModelFieldValues[] },
  userId: string | null,
) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(generationModel).where(eq(generationModel.id, id));
    if (!before) throw new Error('Generation model not found');

    const [after] = await tx
      .update(generationModel)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(generationModel.id, id))
      .returning();
    if (!after) throw new Error('Generation model not found');
    await writeAuditLog(tx, { model: 'GenerationModel', action: 'update', before, after, userId });

    const removed = await tx.delete(modelField).where(eq(modelField.modelId, id)).returning();
    await writeAuditLogs(
      tx,
      'ModelField',
      'delete',
      removed.map((row) => ({ before: row })),
      userId,
    );

    const created =
      fields.length > 0
        ? await tx
            .insert(modelField)
            .values(fields.map((f) => fieldRow(id, f)))
            .returning()
        : [];
    await writeAuditLogs(
      tx,
      'ModelField',
      'create',
      created.map((row) => ({ after: row })),
      userId,
    );

    return { ...after, fields: created };
  });
}

export async function setGenerationModelActive(id: string, isActive: boolean, userId: string | null) {
  const [before] = await db.select().from(generationModel).where(eq(generationModel.id, id));
  if (!before) throw new Error('Generation model not found');

  const [after] = await db.update(generationModel).set({ isActive, updatedAt: new Date() }).where(eq(generationModel.id, id)).returning();
  if (!after) throw new Error('Generation model not found');
  await writeAuditLog(db, { model: 'GenerationModel', action: 'update', before, after, userId });

  const fields = await db.select().from(modelField).where(eq(modelField.modelId, id)).orderBy(modelField.sortOrder);
  return { ...after, fields };
}

/** Deletes the model; its fields go with it through the foreign key cascade. */
export async function deleteGenerationModel(id: string, userId: string | null) {
  const [before] = await db.select().from(generationModel).where(eq(generationModel.id, id));
  if (!before) return;
  await db.delete(generationModel).where(eq(generationModel.id, id));
  await writeAuditLog(db, { model: 'GenerationModel', action: 'delete', before, userId });
}

export async function createEditingModel(
  { fields, createdBy, ...values }: ModelValues & { createdBy: string; imageInputField: string; fields: ModelFieldValues[] },
  userId: string | null,
) {
  return db.transaction(async (tx) => {
    const [model] = await tx
      .insert(editingModel)
      .values({ id: crypto.randomUUID(), createdBy, ...values })
      .returning();
    if (!model) throw new Error('Failed to create editing model');
    await writeAuditLog(tx, { model: 'EditingModel', action: 'create', after: model, userId });

    const created =
      fields.length > 0
        ? await tx
            .insert(editingModelField)
            .values(fields.map((f) => fieldRow(model.id, f)))
            .returning()
        : [];
    await writeAuditLogs(
      tx,
      'EditingModelField',
      'create',
      created.map((after) => ({ after })),
      userId,
    );

    return { ...model, fields: created };
  });
}

export async function updateEditingModel(
  { id, fields, ...values }: ModelValues & { id: string; imageInputField: string; fields: ModelFieldValues[] },
  userId: string | null,
) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(editingModel).where(eq(editingModel.id, id));
    if (!before) throw new Error('Editing model not found');

    const [after] = await tx
      .update(editingModel)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(editingModel.id, id))
      .returning();
    if (!after) throw new Error('Editing model not found');
    await writeAuditLog(tx, { model: 'EditingModel', action: 'update', before, after, userId });

    const removed = await tx.delete(editingModelField).where(eq(editingModelField.modelId, id)).returning();
    await writeAuditLogs(
      tx,
      'EditingModelField',
      'delete',
      removed.map((row) => ({ before: row })),
      userId,
    );

    const created =
      fields.length > 0
        ? await tx
            .insert(editingModelField)
            .values(fields.map((f) => fieldRow(id, f)))
            .returning()
        : [];
    await writeAuditLogs(
      tx,
      'EditingModelField',
      'create',
      created.map((row) => ({ after: row })),
      userId,
    );

    return { ...after, fields: created };
  });
}

export async function setEditingModelActive(id: string, isActive: boolean, userId: string | null) {
  const [before] = await db.select().from(editingModel).where(eq(editingModel.id, id));
  if (!before) throw new Error('Editing model not found');

  const [after] = await db.update(editingModel).set({ isActive, updatedAt: new Date() }).where(eq(editingModel.id, id)).returning();
  if (!after) throw new Error('Editing model not found');
  await writeAuditLog(db, { model: 'EditingModel', action: 'update', before, after, userId });

  const fields = await db.select().from(editingModelField).where(eq(editingModelField.modelId, id)).orderBy(editingModelField.sortOrder);
  return { ...after, fields };
}

export async function deleteEditingModel(id: string, userId: string | null) {
  const [before] = await db.select().from(editingModel).where(eq(editingModel.id, id));
  if (!before) return;
  await db.delete(editingModel).where(eq(editingModel.id, id));
  await writeAuditLog(db, { model: 'EditingModel', action: 'delete', before, userId });
}

// ---------------------------------------------------------------------------
// Global variables
// ---------------------------------------------------------------------------

export function listGlobalVariables(handle: AuditHandle = db) {
  return handle.select().from(globalVariable).orderBy(globalVariable.name);
}

export async function listGlobalVariablesByIds(ids: string[], handle: AuditHandle = db) {
  if (ids.length === 0) return [];
  return handle.select().from(globalVariable).where(inArray(globalVariable.id, ids));
}

export async function getGlobalVariable(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(globalVariable).where(eq(globalVariable.id, id));
  return row;
}

/**
 * Global variables ordered by most recently changed, each with the number of
 * templates using it. A relation count is one of the shapes the relational API
 * cannot express, so this is a core select with an explicit join and GROUP BY
 * (issue #21).
 */
export async function listGlobalVariablesWithUsage(handle: AuditHandle = db) {
  const rows = await handle
    .select({
      id: globalVariable.id,
      name: globalVariable.name,
      label: globalVariable.label,
      type: globalVariable.type,
      description: globalVariable.description,
      defaultValue: globalVariable.defaultValue,
      options: globalVariable.options,
      required: globalVariable.required,
      createdAt: globalVariable.createdAt,
      updatedAt: globalVariable.updatedAt,
      templateCount: count(templateGlobalVariable.id),
    })
    .from(globalVariable)
    .leftJoin(templateGlobalVariable, eq(templateGlobalVariable.globalVariableId, globalVariable.id))
    .groupBy(globalVariable.id)
    .orderBy(desc(globalVariable.updatedAt));

  return rows.map(({ templateCount, ...row }) => ({ ...row, _count: { templates: templateCount } }));
}

/**
 * Whether another global variable already claims this name.
 *
 * `ilike` rather than `eq`, because MariaDB's utf8mb4_unicode_ci made the
 * uniqueness check case-insensitive and the application inherited that without
 * asking for it (issue #23). On Postgres `eq` would silently start accepting
 * `Style` alongside `style`, and the two would then be indistinguishable in a
 * prompt placeholder. The name is a closed identifier (`^[a-zA-Z0-9_]+$`), so
 * it carries no LIKE metacharacters to escape.
 */
export async function globalVariableNameTaken(name: string, excludeId: string | null = null, handle: AuditHandle = db) {
  const where = excludeId ? and(ilike(globalVariable.name, name), ne(globalVariable.id, excludeId)) : ilike(globalVariable.name, name);
  const [row] = await handle.select({ id: globalVariable.id }).from(globalVariable).where(where).limit(1);
  return row !== undefined;
}

export type GlobalVariableValues = {
  name: string;
  label: string;
  type: string;
  description?: string | null;
  defaultValue?: string | null;
  options?: JsonValue;
  required: boolean;
};

export async function createGlobalVariable(values: GlobalVariableValues, userId: string | null, handle: AuditHandle = db) {
  const [row] = await handle
    .insert(globalVariable)
    .values({
      id: crypto.randomUUID(),
      name: values.name,
      label: values.label,
      type: values.type,
      description: values.description ?? null,
      defaultValue: values.defaultValue ?? null,
      options: values.options ?? null,
      required: values.required,
    })
    .returning();
  if (!row) throw new Error('Failed to create global variable');
  await writeAuditLog(handle, { model: 'GlobalVariable', action: 'create', after: row, userId });
  return row;
}

export async function updateGlobalVariable(
  { id, ...values }: GlobalVariableValues & { id: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const before = await getGlobalVariable(id, handle);
  if (!before) throw new Error('Global variable not found');

  const [after] = await handle
    .update(globalVariable)
    .set({
      name: values.name,
      label: values.label,
      type: values.type,
      description: values.description ?? null,
      defaultValue: values.defaultValue ?? null,
      // Prisma left `options` untouched when it was undefined; only an explicit
      // value replaces the stored one.
      ...(values.options === undefined ? {} : { options: values.options }),
      required: values.required,
      updatedAt: new Date(),
    })
    .where(eq(globalVariable.id, id))
    .returning();
  if (!after) throw new Error('Global variable not found');

  await writeAuditLog(handle, { model: 'GlobalVariable', action: 'update', before, after, userId });
  return after;
}

export async function deleteGlobalVariable(id: string, userId: string | null, handle: AuditHandle = db) {
  const before = await getGlobalVariable(id, handle);
  if (!before) return;
  await handle.delete(globalVariable).where(eq(globalVariable.id, id));
  await writeAuditLog(handle, { model: 'GlobalVariable', action: 'delete', before, userId });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Active templates with the global variables they expose, for the picker.
 * `globalVariables -> globalVariable` is the deepest nested include in the
 * codebase and the relational API expresses it directly.
 */
export function listActiveTemplates() {
  return db.query.template.findMany({
    where: { isActive: true },
    with: { globalVariables: { with: { globalVariable: true }, orderBy: BY_SORT_ORDER } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * One active template with everything the template streaming endpoint needs:
 * the editing model and its ordered fields, plus the global variables and their
 * definitions. Three levels deep, in one round trip.
 */
export function getActiveTemplateForGeneration(id: string) {
  return db.query.template.findFirst({
    where: { id, isActive: true },
    with: {
      editingModel: { with: { fields: { orderBy: BY_SORT_ORDER } } },
      globalVariables: { with: { globalVariable: true } },
    },
  });
}

/** Every template with its variable links and its author, for the admin list. */
export function listAdminTemplates() {
  return db.query.template.findMany({
    with: { globalVariables: true, createdByUser: { columns: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/** One template with its variable links, unordered — the admin detail read. */
export function getTemplateWithVariableLinks(id: string) {
  return db.query.template.findFirst({ where: { id }, with: { globalVariables: true } });
}

/** One template with its variable links resolved, for the admin edit form. */
export function getTemplateForEdit(id: string) {
  return db.query.template.findFirst({
    where: { id },
    with: { globalVariables: { with: { globalVariable: true }, orderBy: BY_SORT_ORDER } },
  });
}

export async function getTemplateById(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(template).where(eq(template.id, id));
  return row;
}

/** A template's link to one global variable, with its per-template overrides. */
export type GlobalVariableLink = {
  globalVariableId: string;
  addedOptions?: JsonValue;
  required: boolean;
};

type TemplateValues = {
  name: string;
  description: string | null;
  prompt: string;
  editingModelId: string;
  isActive: boolean;
  minImageCount: number;
  maxImageCount: number;
  inputImageCount: number;
  variables: JsonValue;
  previewImages: string | null;
  editingModelFieldValues: JsonValue;
};

function linkRows(templateId: string, links: GlobalVariableLink[]) {
  return links.map((link, index) => ({
    id: crypto.randomUUID(),
    templateId,
    globalVariableId: link.globalVariableId,
    addedOptions: link.addedOptions ?? null,
    required: link.required,
    sortOrder: index,
  }));
}

export async function createTemplate(
  { links, createdBy, ...values }: TemplateValues & { createdBy: string; links: GlobalVariableLink[] },
  userId: string | null,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(template)
      .values({ id: crypto.randomUUID(), createdBy, ...values })
      .returning();
    if (!row) throw new Error('Failed to create template');
    await writeAuditLog(tx, { model: 'Template', action: 'create', after: row, userId });

    if (links.length > 0) {
      const created = await tx.insert(templateGlobalVariable).values(linkRows(row.id, links)).returning();
      await writeAuditLogs(
        tx,
        'TemplateGlobalVariable',
        'create',
        created.map((after) => ({ after })),
        userId,
      );
    }
    return row;
  });
}

/** Updates the template and replaces its global-variable links, in one transaction. */
export async function updateTemplate(
  { id, links, ...values }: TemplateValues & { id: string; links: GlobalVariableLink[] },
  userId: string | null,
) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(template).where(eq(template.id, id));
    if (!before) throw new Error('Template not found');

    const [after] = await tx
      .update(template)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(template.id, id))
      .returning();
    if (!after) throw new Error('Template not found');
    await writeAuditLog(tx, { model: 'Template', action: 'update', before, after, userId });

    const removed = await tx.delete(templateGlobalVariable).where(eq(templateGlobalVariable.templateId, id)).returning();
    await writeAuditLogs(
      tx,
      'TemplateGlobalVariable',
      'delete',
      removed.map((row) => ({ before: row })),
      userId,
    );

    if (links.length > 0) {
      const created = await tx.insert(templateGlobalVariable).values(linkRows(id, links)).returning();
      await writeAuditLogs(
        tx,
        'TemplateGlobalVariable',
        'create',
        created.map((row) => ({ after: row })),
        userId,
      );
    }
    return after;
  });
}

/**
 * Deletes a template. Its variable links and generations follow through the
 * foreign key cascade, which is the database's job and not separately audited —
 * the `Template` delete row is the record of intent.
 */
export async function deleteTemplate(id: string, userId: string | null, handle: AuditHandle = db) {
  const before = await getTemplateById(id, handle);
  if (!before) return;
  await handle.delete(template).where(eq(template.id, id));
  await writeAuditLog(handle, { model: 'Template', action: 'delete', before, userId });
}

// ---------------------------------------------------------------------------
// Template generations
// ---------------------------------------------------------------------------

/** One generation with its template and its result file, for the status poll. */
export function getTemplateGenerationWithResult(id: string) {
  return db.query.templateGeneration.findFirst({ where: { id }, with: { template: true, resultFile: true } });
}

/** One generation the user owns, with its result file — the delete path. */
export function getOwnedTemplateGenerationWithResult(id: string, userId: string) {
  return db.query.templateGeneration.findFirst({ where: { id, userId }, with: { resultFile: true } });
}

/**
 * A user's generations still marked processing whose Replicate prediction needs
 * reconciling. Same predicate as the scheduled reconciler's
 * `listStuckTemplateGenerations` in `tasks.ts`, and the same inner join for the
 * same reason — `templateId` is NOT NULL, so the join makes that visible in the
 * type. It differs only in being scoped to one user and unbounded: the request
 * that triggers it only ever sees its own in-flight work.
 *
 * A row is skipped while its own SSE stream is still writing progress
 * (`replicateStatus = 'streaming'` and younger than the cutoff), so the poll
 * cannot race the stream into a false failure.
 */
export function listReconcilableTemplateGenerations(userId: string, staleStreamingCutoff: Date, handle: AuditHandle = db) {
  return handle
    .select({
      id: templateGeneration.id,
      templateId: templateGeneration.templateId,
      replicateId: templateGeneration.replicateId,
      template: { name: template.name },
    })
    .from(templateGeneration)
    .innerJoin(template, eq(template.id, templateGeneration.templateId))
    .where(
      and(
        eq(templateGeneration.userId, userId),
        eq(templateGeneration.status, 'processing'),
        isNotNull(templateGeneration.replicateId),
        or(
          isNull(templateGeneration.replicateStatus),
          ne(templateGeneration.replicateStatus, 'streaming'),
          lt(templateGeneration.createdAt, staleStreamingCutoff),
        ),
      ),
    );
}

/** A user's generations still running, newest first, for the queue indicator. */
export async function listActiveTemplateGenerations(userId: string, handle: AuditHandle = db) {
  return handle
    .select({
      id: templateGeneration.id,
      status: templateGeneration.status,
      createdAt: templateGeneration.createdAt,
      template: { name: template.name },
    })
    .from(templateGeneration)
    .innerJoin(template, eq(template.id, templateGeneration.templateId))
    .where(and(eq(templateGeneration.userId, userId), eq(templateGeneration.status, 'processing')))
    .orderBy(desc(templateGeneration.createdAt));
}

/** A user's most recent generations with template name and result URL. */
export function listTemplateGenerationHistory(userId: string, limit: number) {
  return db.query.templateGeneration.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    limit,
    with: { resultFile: { columns: { url: true } }, template: { columns: { name: true } } },
  });
}

/** The fields the streaming endpoint writes on each progress step. */
export type TemplateGenerationValues = {
  id: string;
  templateId: string;
  userId: string;
  variableValues: JsonValue;
  finalPrompt: string;
  status: string;
  errorMessage?: string | null;
  replicateId?: string;
  replicateStatus?: string;
  originalImageUrls: JsonValue;
  resultFileId?: string | null;
};

/**
 * Creates or updates the generation row a streaming request owns.
 *
 * Deliberately NOT wrapped in a transaction spanning the stream: the endpoint
 * calls this repeatedly over minutes of polling, and a transaction held open for
 * that long would pin a connection and block vacuum. Each call is one statement
 * plus its audit savepoint.
 *
 * `replicateId` and `replicateStatus` are omitted rather than nulled when the
 * caller does not supply them, matching Prisma's `undefined`-means-untouched
 * semantics — a later progress write must not erase the prediction id.
 */
export async function upsertTemplateGeneration(values: TemplateGenerationValues, userId: string | null, handle: AuditHandle = db) {
  const mutable = {
    templateId: values.templateId,
    userId: values.userId,
    variableValues: values.variableValues,
    finalPrompt: values.finalPrompt,
    status: values.status,
    errorMessage: values.errorMessage ?? null,
    ...(values.replicateId === undefined ? {} : { replicateId: values.replicateId }),
    ...(values.replicateStatus === undefined ? {} : { replicateStatus: values.replicateStatus }),
    originalImageUrls: values.originalImageUrls,
    resultFileId: values.resultFileId ?? null,
  };

  const [before] = await handle.select().from(templateGeneration).where(eq(templateGeneration.id, values.id));

  if (before) {
    const [after] = await handle.update(templateGeneration).set(mutable).where(eq(templateGeneration.id, values.id)).returning();
    if (after) await writeAuditLog(handle, { model: 'TemplateGeneration', action: 'update', before, after, userId });
    return after;
  }

  const [after] = await handle
    .insert(templateGeneration)
    .values({ id: values.id, ...mutable })
    .returning();
  if (after) await writeAuditLog(handle, { model: 'TemplateGeneration', action: 'create', after, userId });
  return after;
}

/** Records a finished generation and the file it produced. */
export async function markTemplateGenerationSucceeded(
  id: string,
  { resultFileId, replicateStatus }: { resultFileId: string; replicateStatus: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [before] = await handle.select().from(templateGeneration).where(eq(templateGeneration.id, id));
  if (!before) return;

  const [after] = await handle
    .update(templateGeneration)
    .set({ status: 'success', resultFileId, replicateStatus })
    .where(eq(templateGeneration.id, id))
    .returning();
  if (after) await writeAuditLog(handle, { model: 'TemplateGeneration', action: 'update', before, after, userId });
}

/**
 * Fails every one of the user's generations in `ids` that is still processing.
 * Used when a stream is cancelled or dies, where several rows share one fate.
 */
export async function markTemplateGenerationsFailed(
  { ids, ownerId, errorMessage }: { ids: string[]; ownerId: string; errorMessage: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  if (ids.length === 0) return 0;
  const where = and(
    inArray(templateGeneration.id, ids),
    eq(templateGeneration.userId, ownerId),
    eq(templateGeneration.status, 'processing'),
  );

  const before = await handle.select().from(templateGeneration).where(where);
  if (before.length === 0) return 0;

  const after = await handle.update(templateGeneration).set({ status: 'failed', errorMessage }).where(where).returning();

  const afterById = new Map(after.map((row) => [row.id, row]));
  for (const row of before) {
    const updated = afterById.get(row.id);
    if (updated) await writeAuditLog(handle, { model: 'TemplateGeneration', action: 'update', before: row, after: updated, userId });
  }
  return after.length;
}

/**
 * Detaches a deleted result image from its generation. The file itself is
 * soft-deleted separately through the files module, which audits it there.
 */
export async function detachTemplateGenerationResult(
  { id, ownerId, errorMessage }: { id: string; ownerId: string; errorMessage: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const where = and(eq(templateGeneration.id, id), eq(templateGeneration.userId, ownerId));
  const [before] = await handle.select().from(templateGeneration).where(where);
  if (!before) return;

  const [after] = await handle.update(templateGeneration).set({ resultFileId: null, errorMessage }).where(where).returning();
  if (after) await writeAuditLog(handle, { model: 'TemplateGeneration', action: 'update', before, after, userId });
}

/** Removes one history row. The generated file stays in the user's gallery. */
export async function deleteTemplateGenerationRow(id: string, ownerId: string, userId: string | null, handle: AuditHandle = db) {
  const where = and(eq(templateGeneration.id, id), eq(templateGeneration.userId, ownerId));
  const [before] = await handle.select().from(templateGeneration).where(where);
  if (!before) return;

  await handle.delete(templateGeneration).where(where);
  await writeAuditLog(handle, { model: 'TemplateGeneration', action: 'delete', before, userId });
}

/** Clears a user's finished template history rows. Returns how many went. */
export async function deleteCompletedTemplateGenerations(ownerId: string, userId: string | null, handle: AuditHandle = db) {
  const where = and(eq(templateGeneration.userId, ownerId), inArray(templateGeneration.status, ['success', 'failed']));
  const before = await handle.select().from(templateGeneration).where(where);
  if (before.length === 0) return 0;

  await handle.delete(templateGeneration).where(where);
  await writeAuditLogs(
    handle,
    'TemplateGeneration',
    'delete',
    before.map((row) => ({ before: row })),
    userId,
  );
  return before.length;
}

// ---------------------------------------------------------------------------
// Ad-hoc AI generations (image generation and image editing history)
// ---------------------------------------------------------------------------

/** The fields a streaming endpoint writes for a non-template generation. */
export type AiGenerationValues = {
  id: string;
  kind: string;
  userId: string;
  modelId: string;
  modelLabel: string;
  prompt?: string | null;
  inputImageUrls?: JsonValue;
  status: string;
  errorMessage?: string | null;
  result: JsonValue;
};

/**
 * Creates or updates the history row a streaming request owns. Like its
 * template counterpart this is one statement per call and never a transaction
 * spanning the stream.
 *
 * `inputImageUrls` is omitted when undefined so a later progress write does not
 * erase the input previews recorded earlier in the same stream.
 */
export async function upsertAiGeneration(values: AiGenerationValues, userId: string | null, handle: AuditHandle = db) {
  const mutable = {
    kind: values.kind,
    userId: values.userId,
    modelId: values.modelId,
    modelLabel: values.modelLabel,
    prompt: values.prompt ?? null,
    ...(values.inputImageUrls === undefined ? {} : { inputImageUrls: values.inputImageUrls }),
    status: values.status,
    errorMessage: values.errorMessage ?? null,
    result: values.result,
  };

  const [before] = await handle.select().from(aiGeneration).where(eq(aiGeneration.id, values.id));

  if (before) {
    const [after] = await handle.update(aiGeneration).set(mutable).where(eq(aiGeneration.id, values.id)).returning();
    if (after) await writeAuditLog(handle, { model: 'AiGeneration', action: 'update', before, after, userId });
    return after;
  }

  const [after] = await handle
    .insert(aiGeneration)
    .values({ id: values.id, ...mutable })
    .returning();
  if (after) await writeAuditLog(handle, { model: 'AiGeneration', action: 'create', after, userId });
  return after;
}

/** Marks a still-processing generation as cancelled by its owner. */
export async function markAiGenerationCancelled(id: string, ownerId: string, userId: string | null, handle: AuditHandle = db) {
  const where = and(eq(aiGeneration.id, id), eq(aiGeneration.userId, ownerId), eq(aiGeneration.status, 'processing'));
  const [before] = await handle.select().from(aiGeneration).where(where);
  if (!before) return;

  const [after] = await handle
    .update(aiGeneration)
    .set({ status: 'failed', errorMessage: 'Generation was cancelled' })
    .where(where)
    .returning();
  if (after) await writeAuditLog(handle, { model: 'AiGeneration', action: 'update', before, after, userId });
}

/** A user's most recent generations of one kind, newest first. */
export function listAiGenerations(ownerId: string, kind: string, limit: number, handle: AuditHandle = db) {
  return handle
    .select()
    .from(aiGeneration)
    .where(and(eq(aiGeneration.userId, ownerId), eq(aiGeneration.kind, kind)))
    .orderBy(desc(aiGeneration.createdAt))
    .limit(limit);
}

/** Removes one history row. The generated file stays in the user's gallery. */
export async function deleteAiGeneration(id: string, ownerId: string, userId: string | null, handle: AuditHandle = db) {
  const where = and(eq(aiGeneration.id, id), eq(aiGeneration.userId, ownerId));
  const [before] = await handle.select().from(aiGeneration).where(where);
  if (!before) return;

  await handle.delete(aiGeneration).where(where);
  await writeAuditLog(handle, { model: 'AiGeneration', action: 'delete', before, userId });
}

/** Clears a user's finished history rows of one kind. Returns how many went. */
export async function deleteCompletedAiGenerations(ownerId: string, kind: string, userId: string | null, handle: AuditHandle = db) {
  const where = and(eq(aiGeneration.userId, ownerId), eq(aiGeneration.kind, kind), inArray(aiGeneration.status, ['succeeded', 'failed']));
  const before = await handle.select().from(aiGeneration).where(where);
  if (before.length === 0) return 0;

  await handle.delete(aiGeneration).where(where);
  await writeAuditLogs(
    handle,
    'AiGeneration',
    'delete',
    before.map((row) => ({ before: row })),
    userId,
  );
  return before.length;
}

// ---------------------------------------------------------------------------
// Image presets
// ---------------------------------------------------------------------------

/** A user's saved field-value sets for one model, oldest first. */
export function listImagePresets(ownerId: string, modelId: string, handle: AuditHandle = db) {
  return handle
    .select()
    .from(imagePreset)
    .where(and(eq(imagePreset.userId, ownerId), eq(imagePreset.modelId, modelId)))
    .orderBy(imagePreset.createdAt);
}

export async function createImagePreset(
  { ownerId, modelId, name, fieldValues }: { ownerId: string; modelId: string; name: string; fieldValues: JsonValue },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [row] = await handle
    .insert(imagePreset)
    .values({ id: crypto.randomUUID(), userId: ownerId, modelId, name, fieldValues })
    .returning();
  if (!row) throw new Error('Failed to create preset');
  await writeAuditLog(handle, { model: 'ImagePreset', action: 'create', after: row, userId });
  return row;
}

export async function deleteImagePreset(id: string, ownerId: string, userId: string | null, handle: AuditHandle = db) {
  const where = and(eq(imagePreset.id, id), eq(imagePreset.userId, ownerId));
  const [before] = await handle.select().from(imagePreset).where(where);
  if (!before) return;

  await handle.delete(imagePreset).where(where);
  await writeAuditLog(handle, { model: 'ImagePreset', action: 'delete', before, userId });
}

// ---------------------------------------------------------------------------
// Cached input images
// ---------------------------------------------------------------------------

/**
 * `CachedImage` is a derived artifact, not intent — it is in `UNAUDITED_MODELS`
 * and none of the writes below record an audit row.
 *
 * `cached_image.hash` was deliberately left un-normalised by the data migration
 * (`scripts/db/transform-tables.ts`), and this batch owns that decision: the
 * value is only ever produced by `createHash('md5').digest('hex')` on both the
 * write and the read side, so no case boundary exists for it. Verified against
 * the migrated data — all 92 rows are already lower-case.
 */
export async function findCachedImage(ownerId: string, hash: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select()
    .from(cachedImage)
    .where(and(eq(cachedImage.ownerId, ownerId), eq(cachedImage.hash, hash)));
  return row;
}

export async function touchCachedImage(ownerId: string, hash: string, handle: AuditHandle = db) {
  await handle
    .update(cachedImage)
    .set({ lastAccessedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(cachedImage.ownerId, ownerId), eq(cachedImage.hash, hash)));
}

export async function upsertCachedImage(
  {
    ownerId,
    hash,
    url,
    filename,
    contentType,
    size,
    purpose,
  }: { ownerId: string; hash: string; url: string; filename: string; contentType: string; size: number; purpose: string },
  handle: AuditHandle = db,
) {
  await handle
    .insert(cachedImage)
    .values({ id: crypto.randomUUID(), ownerId, hash, url, filename, contentType, size, purpose })
    .onConflictDoUpdate({
      target: [cachedImage.ownerId, cachedImage.hash],
      set: { url, filename, contentType, size, purpose, lastAccessedAt: new Date(), updatedAt: new Date() },
    });
}

// ---------------------------------------------------------------------------
// Generated files
// ---------------------------------------------------------------------------

/**
 * One image file the owner owns, with its pixel dimensions — the beautifier's
 * source read. Lives here rather than in the files module because the beautifier
 * is the only caller.
 */
export function getOwnedImageFile(id: string, ownerId: string) {
  return db.query.file.findFirst({
    where: { id, ownerId, isDeleted: false },
    with: { metadata: { columns: { width: true, height: true } } },
  });
}

/**
 * Inserts the file an AI generation or a beautifier save produced, taking the
 * storage quota in the same transaction.
 *
 * Admission control and the insert it guards MUST share one transaction: the
 * quota read takes a row lock, and a lock released before the insert would let
 * two concurrent generations both see the same free space and both fit. This is
 * the last of the sites that took that lock through Prisma.
 *
 * Short-lived by construction — the S3 upload happens before it opens, so no
 * transaction is ever held across a network round trip or across an SSE stream.
 */
export async function createGeneratedFile(
  values: {
    ownerId: string;
    size: number;
    url: string;
    private: boolean;
    tags: string;
    title: string;
    contentType: string;
    folderId?: string | null;
    dimensions?: { width: number; height: number; description: string };
  },
  userId: string | null,
) {
  const { dimensions, ...fileValues } = values;
  return db.transaction(async (tx: Tx) => {
    await ensureStorageQuotaAvailable(tx, values.ownerId, values.size);

    const [row] = await tx
      .insert(file)
      .values({ id: crypto.randomUUID(), ...fileValues, folderId: fileValues.folderId ?? null })
      .returning();
    if (!row) throw new Error('Failed to create file');

    if (dimensions) {
      await tx.insert(fileMetadata).values({
        id: crypto.randomUUID(),
        fileId: row.id,
        width: dimensions.width,
        height: dimensions.height,
        description: dimensions.description,
      });
    }

    await writeAuditLog(tx, { model: 'File', action: 'create', after: row, userId });
    return row;
  });
}
