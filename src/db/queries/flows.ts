import { and, desc, eq } from 'drizzle-orm';
import { type AuditHandle, writeAuditLog } from '../audit';
import { db } from '../client';
import { token } from '../schema/auth';
import { flow, flowRun } from '../schema/automation';
import type { JsonValue } from '../schema/json';

/**
 * Query module for flow definitions and flow runs (issue #15). Call sites import
 * these functions and never the `db` handle, which is what keeps the upload paths
 * (#33) from reaching past this boundary to trigger a flow.
 *
 * `Flow` is audited — a flow definition is deliberate user intent. `FlowRun` is
 * not: it is an execution record, not intent (see `UNAUDITED_MODELS` in
 * `src/db/audit.ts`). None of the flow-run writes below carry an audit call, and
 * that omission is the point.
 *
 * `triggerType` and `status` are closed vocabularies written by the application
 * from validated enums, never free text a user typed, so their equality filters
 * stay case-sensitive rather than becoming `ilike` (issue #23).
 */

/** The owner's live flow definitions, most recently updated first. */
export function listOwnedFlows(ownerId: string, handle: AuditHandle = db) {
  return handle
    .select()
    .from(flow)
    .where(and(eq(flow.ownerId, ownerId), eq(flow.isActive, true)))
    .orderBy(desc(flow.updatedAt));
}

/** One flow by id, regardless of owner — the runner already holds a trusted id. */
export async function getFlow(id: string, handle: AuditHandle = db) {
  const [row] = await handle.select().from(flow).where(eq(flow.id, id));
  return row;
}

/** One flow the owner owns, or undefined. */
export async function getOwnedFlow(id: string, ownerId: string, handle: AuditHandle = db) {
  const [row] = await handle
    .select()
    .from(flow)
    .where(and(eq(flow.id, id), eq(flow.ownerId, ownerId)));
  return row;
}

/**
 * The flows a trigger should fan out to: either the single flow an upload token
 * pins, or every enabled flow the owner has for that trigger type. Both forms
 * require the flow to be enabled and still active, so a disabled or soft-deleted
 * flow never runs.
 */
export function listTriggerableFlows(
  { ownerId, triggerType, flowId }: { ownerId: string; triggerType: string; flowId?: string | null },
  handle: AuditHandle = db,
): Promise<{ id: string }[]> {
  const scope = flowId ? eq(flow.id, flowId) : eq(flow.triggerType, triggerType);
  return handle
    .select({ id: flow.id })
    .from(flow)
    .where(and(scope, eq(flow.ownerId, ownerId), eq(flow.enabled, true), eq(flow.isActive, true)));
}

export async function createOwnedFlow(
  {
    name,
    ownerId,
    enabled,
    triggerType,
    graph,
  }: { name: string; ownerId: string; enabled: boolean; triggerType: string; graph: JsonValue },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const [row] = await handle.insert(flow).values({ id: crypto.randomUUID(), name, ownerId, enabled, triggerType, graph }).returning();
  if (!row) throw new Error('Failed to create flow');
  await writeAuditLog(handle, { model: 'Flow', action: 'create', after: row, userId });
  return row;
}

/**
 * Replaces a flow definition and bumps its version. `updatedAt` is set here
 * because Prisma applied `@updatedAt` at query level rather than in the
 * database, so the data-access layer owns it now (issue #23).
 */
export async function updateOwnedFlow(
  {
    id,
    ownerId,
    name,
    enabled,
    triggerType,
    graph,
  }: { id: string; ownerId: string; name: string; enabled: boolean; triggerType: string; graph: JsonValue },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const before = await getOwnedFlow(id, ownerId, handle);
  if (!before) return undefined;

  const [after] = await handle
    .update(flow)
    .set({ name, enabled, triggerType, graph, version: before.version + 1, updatedAt: new Date() })
    .where(and(eq(flow.id, id), eq(flow.ownerId, ownerId)))
    .returning();
  if (!after) return undefined;

  await writeAuditLog(handle, { model: 'Flow', action: 'update', before, after, userId });
  return after;
}

/**
 * Retires a flow: marks it inactive and disabled, then unpins it from any of the
 * owner's upload tokens so those tokens keep working instead of pointing at a
 * flow that will never run.
 *
 * This replaces Prisma's array-form `$transaction([...])`, which has no Drizzle
 * equivalent — batch execution is not supported on this driver (issue #12). The
 * two statements become sequential awaits inside one transaction callback, which
 * is strictly more capable: the token read that decides what to audit now sits
 * inside the same transaction as the writes, which the array form could not
 * express at all.
 *
 * Both halves are audited: `Flow` for the retirement, `Token` for each token that
 * loses its pin (the audit layer redacts the token secret, issue #27).
 */
export async function deactivateOwnedFlow(
  { id, ownerId }: { id: string; ownerId: string },
  userId: string | null,
  handle: AuditHandle = db,
) {
  const before = await getOwnedFlow(id, ownerId, handle);
  if (!before) return undefined;

  await handle.transaction(async (tx) => {
    const [after] = await tx
      .update(flow)
      .set({ isActive: false, enabled: false, updatedAt: new Date() })
      .where(and(eq(flow.id, id), eq(flow.ownerId, ownerId)))
      .returning();
    if (after) await writeAuditLog(tx, { model: 'Flow', action: 'update', before, after, userId });

    const pinnedTokens = await tx
      .select()
      .from(token)
      .where(and(eq(token.flowId, id), eq(token.userId, ownerId)));
    if (pinnedTokens.length === 0) return;

    const unpinned = await tx
      .update(token)
      .set({ flowId: null, updatedAt: new Date() })
      .where(and(eq(token.flowId, id), eq(token.userId, ownerId)))
      .returning();

    const unpinnedById = new Map(unpinned.map((row) => [row.id, row]));
    for (const row of pinnedTokens) {
      const updated = unpinnedById.get(row.id);
      if (updated) await writeAuditLog(tx, { model: 'Token', action: 'update', before: row, after: updated, userId });
    }
  });

  return { id };
}

/**
 * Opens a run record. Unaudited: a run is an execution record, not intent.
 * `items` and `logs` are jsonb, typed `JsonValue` so TanStack Start can
 * serialise them across the server-function boundary.
 */
export async function createFlowRun(
  { flowId, ownerId, triggeredBy, items }: { flowId: string; ownerId: string; triggeredBy: string; items: JsonValue },
  handle: AuditHandle = db,
) {
  const [row] = await handle
    .insert(flowRun)
    .values({ id: crypto.randomUUID(), flowId, ownerId, status: 'running', triggeredBy, items, logs: [] })
    .returning();
  if (!row) throw new Error('Failed to create flow run');
  return row;
}

/** Closes a run record with its outcome. Unaudited, for the same reason. */
export async function completeFlowRun(
  { id, status, duration, logs, error }: { id: string; status: 'success' | 'failed'; duration: number; logs: JsonValue; error?: string },
  handle: AuditHandle = db,
) {
  const completedAt = new Date();
  await handle
    .update(flowRun)
    .set({ status, duration, completedAt, logs, error: error ?? null, updatedAt: completedAt })
    .where(eq(flowRun.id, id));
}

/**
 * The most recent runs of a flow, newest first. The table is empty in production
 * — flow runs were excluded from the data migration — so the caller must render
 * an empty history correctly.
 */
export function listFlowRuns(flowId: string, limit = 50, handle: AuditHandle = db) {
  return handle.select().from(flowRun).where(eq(flowRun.flowId, flowId)).orderBy(desc(flowRun.startedAt)).limit(limit);
}
