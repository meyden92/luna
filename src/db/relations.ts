import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Relations are declared only where a relational query actually needs one, not
 * one per foreign key (issue #14) — nothing keeps these synchronised with the
 * schema, so every declaration is a maintenance liability. The set below is
 * derived from the `include:` shapes the Prisma call sites really use; a batch
 * that needs a new shape adds the relation then, with a call site to justify it.
 *
 * Names match Prisma's relation field names so translating a call site stays
 * mechanical rather than a renaming exercise.
 *
 * Uses the v2 `defineRelations` API from the Drizzle 1.0 line (issue #25).
 *
 * Not expressible here, and deliberately left to core selects with explicit
 * joins (issue #21): relation counts (`_count`), grouping and aggregation, and
 * ordering a parent by a related column — `admin/deleted-files` orders files by
 * `owner.name`, which the relational API cannot do.
 */
export const relations = defineRelations(schema, (r) => ({
  file: {
    owner: r.one.user({ from: r.file.ownerId, to: r.user.id }),
    folder: r.one.folder({ from: r.file.folderId, to: r.folder.id, optional: true }),
    metadata: r.one.fileMetadata({ from: r.file.id, to: r.fileMetadata.fileId, optional: true }),
  },
  folder: {
    owner: r.one.user({ from: r.folder.ownerId, to: r.user.id }),
    files: r.many.file(),
  },
  user: {
    files: r.many.file(),
    folders: r.many.folder(),
  },
  fileMetadata: {
    file: r.one.file({ from: r.fileMetadata.fileId, to: r.file.id }),
  },

  // Authentication — `token-auth` resolves an API token to its user on every
  // token-authenticated request.
  token: {
    user: r.one.user({ from: r.token.userId, to: r.user.id }),
  },

  // Scheduled tasks — the loader, the sync service and the admin views all read
  // a task with its most recent executions.
  task: {
    executions: r.many.taskExecution(),
  },
  taskExecution: {
    task: r.one.task({ from: r.taskExecution.taskId, to: r.task.id }),
    executedByUser: r.one.user({ from: r.taskExecution.executedBy, to: r.user.id, optional: true }),
  },

  // Templates and generation. `template -> globalVariables -> globalVariable`
  // is the deepest nested include in the codebase.
  template: {
    globalVariables: r.many.templateGlobalVariable(),
    // `optional: false` on both NOT NULL foreign keys below, for the same reason
    // as `snippet.author`: the row always resolves, so the admin list and the
    // template editor need no null branch the database already rules out.
    createdByUser: r.one.user({ from: r.template.createdBy, to: r.user.id, optional: false }),
    editingModel: r.one.editingModel({ from: r.template.editingModelId, to: r.editingModel.id, optional: true }),
  },
  templateGlobalVariable: {
    template: r.one.template({ from: r.templateGlobalVariable.templateId, to: r.template.id }),
    globalVariable: r.one.globalVariable({
      from: r.templateGlobalVariable.globalVariableId,
      to: r.globalVariable.id,
      optional: false,
    }),
  },
  globalVariable: {
    templates: r.many.templateGlobalVariable(),
  },
  templateGeneration: {
    // `optional: false` because `template_generation.template_id` is NOT NULL
    // behind a foreign key: the template always resolves, and the history and
    // status-poll call sites need not carry a null branch the database rules out.
    template: r.one.template({ from: r.templateGeneration.templateId, to: r.template.id, optional: false }),
    resultFile: r.one.file({ from: r.templateGeneration.resultFileId, to: r.file.id, optional: true }),
  },

  // Model configuration — both model kinds are read with their fields ordered
  // by sortOrder, by the streaming endpoints and the admin surfaces.
  generationModel: {
    fields: r.many.modelField(),
  },
  modelField: {
    model: r.one.generationModel({ from: r.modelField.modelId, to: r.generationModel.id }),
  },
  editingModel: {
    fields: r.many.editingModelField(),
  },
  editingModelField: {
    model: r.one.editingModel({ from: r.editingModelField.modelId, to: r.editingModel.id }),
  },

  // Form shares — the public share view reads a form with its fields; the field
  // decryption path reads a field back to its form to check expiry.
  formShare: {
    fields: r.many.formShareField(),
  },
  formShareField: {
    form: r.one.formShare({ from: r.formShareField.formId, to: r.formShare.id }),
  },

  // Snippets — the public `/bin/$id` page shows who wrote the snippet.
  // `optional: false` because `snippet.owner_id` is NOT NULL behind a foreign
  // key, so the author always resolves and the page need not handle a null one.
  snippet: {
    author: r.one.user({ from: r.snippet.ownerId, to: r.user.id, optional: false }),
  },
}));
