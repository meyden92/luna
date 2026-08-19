import { getRequestHeaders } from '@tanstack/react-start/server';
import { DiffEngine } from '@/libs/audit/diff-engine';
import { MetadataCollector } from '@/libs/audit/metadata-collector';
import { Summarizer } from '@/libs/audit/summarizer';
import type { Db, Tx } from './client';
import { auditLog } from './schema/admin';

/**
 * Explicit audited writes (issue #13).
 *
 * Drizzle has no query-interception layer, so `Prisma.defineExtension` has no
 * equivalent and auditing becomes explicit. This is not a new mechanism: it
 * generalises `writeCreateAuditLog`, which already audited five transaction
 * sites in production precisely because implicit interception could not reach
 * them. `DiffEngine`, `MetadataCollector` and `Summarizer` are unchanged.
 *
 * Audit calls belong INSIDE the query module's write function, never at the
 * call site — that is what makes them impossible to forget.
 */

/**
 * The 24 models that record deliberate user or admin action (#13). Session
 * churn, derived artifacts, analytics and execution records are deliberately
 * absent; the implicit extension covered everything, so an over-eager port is
 * as wrong as a missing one.
 *
 * Names match Prisma's model names because they are what `audit_log.model`
 * already holds and what the admin audit UI filters on.
 */
export const AUDITED_MODELS = [
  // Content
  'File',
  'Folder',
  'Snippet',
  // Templates and variables
  'Template',
  'TemplateGlobalVariable',
  'GlobalVariable',
  // AI tooling
  'AiGeneration',
  'TemplateGeneration',
  'GenerationModel',
  'ModelField',
  'EditingModel',
  'EditingModelField',
  'ImagePreset',
  // Sharing
  'FormShare',
  'FormShareField',
  // Automation definitions
  'Flow',
  'Task',
  // User data
  'NicotineEntry',
  // Account and credentials
  'User',
  'Token',
  // Administration
  'RbacGroup',
  'UserGroupAssignment',
  'DenylistEntry',
  'ModerationCase',
] as const;

export type AuditedModel = (typeof AUDITED_MODELS)[number];

/**
 * The 14 models that are deliberately not audited, with the reason. Kept
 * alongside the audited set so #45 can assert both directions: that every
 * audited model produces rows, and that these produce none.
 */
export const UNAUDITED_MODELS: Record<string, string> = {
  Session: 'session and auth churn',
  Account: 'session and auth churn',
  Verification: 'session and auth churn',
  FileRendition: 'derived artifact',
  FileMetadata: 'derived artifact',
  OCRResult: 'derived artifact',
  CachedImage: 'derived artifact',
  ViewEvent: 'analytics',
  ViewDailyRollup: 'analytics',
  EgressEvent: 'analytics',
  EgressRollup: 'analytics',
  FlowRun: 'execution record, not intent',
  TaskExecution: 'execution record, not intent',
  AuditLog: 'self',
};

/**
 * Fields stripped from every audit snapshot, per model.
 *
 * Field-level redaction is mandatory, not optional (#13). `Token` stays audited
 * because creating and revoking an API key is exactly the kind of deliberate act
 * worth recording, but the secret must never reach an audit row — the Prisma
 * implementation had no redaction at all and wrote credentials in cleartext,
 * raised as #27.
 */
const REDACTED_FIELDS: Partial<Record<AuditedModel, string[]>> = {
  Token: ['key'],
};

export type AuditAction = 'create' | 'update' | 'delete';

/** A row snapshot. Every audited model has a string `id`. */
type AuditRecord = { id: string } & Record<string, unknown>;

/**
 * Accepts the top-level handle or a transaction handle. Both expose
 * `.transaction()`, which is what the savepoint below relies on.
 */
export type AuditHandle = Db | Tx;

/** Deep-clones through JSON so jsonb receives plain data, minus redacted fields. */
function snapshot(model: AuditedModel, record: AuditRecord | null): Record<string, unknown> | null {
  if (!record) return null;
  const redacted = REDACTED_FIELDS[model];
  const source = redacted ? Object.fromEntries(Object.entries(record).filter(([key]) => !redacted.includes(key))) : record;
  return JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
}

async function currentUserId(): Promise<string | null> {
  try {
    const { auth } = await import('@/libs/auth/auth');
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    return session?.user?.id ?? null;
  } catch {
    // No request context (a scheduled task, a script). Not an error.
    return null;
  }
}

/**
 * Writes one audit row for a change already made on `handle`.
 *
 * The write happens on a SAVEPOINT. That is what lets both requirements hold at
 * once, which they otherwise cannot: the audit row is written inside the same
 * transaction as the business write, and yet a failing audit write can never
 * roll back or corrupt that business write. Without the savepoint, a failed
 * INSERT poisons the surrounding Postgres transaction and catching the error
 * would not save it.
 *
 * `userId` defaults to the caller resolved from the request, so scheduled tasks
 * and scripts audit as `null` rather than misattributing.
 */
export async function writeAuditLog(
  handle: AuditHandle,
  {
    model,
    action,
    before = null,
    after = null,
    userId,
  }: {
    model: AuditedModel;
    action: AuditAction;
    before?: AuditRecord | null;
    after?: AuditRecord | null;
    userId?: string | null;
  },
): Promise<void> {
  try {
    const beforeSnapshot = snapshot(model, before);
    const afterSnapshot = snapshot(model, after);
    const recordId = after?.id ?? before?.id;
    if (!recordId) throw new Error('neither snapshot carries an id');

    const diff = DiffEngine.generateDiffResult(beforeSnapshot, afterSnapshot);
    const metadata = await MetadataCollector.collectFromRequest();

    const row = {
      id: crypto.randomUUID(),
      model,
      action,
      recordId,
      userId: userId === undefined ? await currentUserId() : userId,
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: metadata ? (JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>) : null,
      changeSet: MetadataCollector.generateChangeSetId(),
      summary: Summarizer.generateActionSummary(model, action, diff.changes, recordId),
      fieldChanges: diff.hasChanges ? (JSON.parse(JSON.stringify(diff.changes)) as unknown) : null,
    };

    await handle.transaction(async (savepoint) => {
      await savepoint.insert(auditLog).values(row);
    });
  } catch (error) {
    // The invariant, carried over verbatim from the Prisma implementation: an
    // audit failure must never corrupt, alter or roll back the business write.
    // That covers the whole body, not just the insert -- a bug in diffing or
    // metadata collection would otherwise take the business write down with it.
    // Loud on the way out, because a silently missing audit row is its own bug.
    console.error(`[audit] failed to record ${action} on ${model}`, error);
  }
}

/**
 * Audits several rows changed together — a bulk update or delete — under one
 * changeSet, mirroring what the implicit extension did for `updateMany` and
 * `deleteMany`.
 */
export async function writeAuditLogs(
  handle: AuditHandle,
  model: AuditedModel,
  action: AuditAction,
  records: { before?: AuditRecord | null; after?: AuditRecord | null }[],
  userId?: string | null,
): Promise<void> {
  for (const record of records) {
    await writeAuditLog(handle, { model, action, ...record, userId });
  }
}
