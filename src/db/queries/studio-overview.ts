import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { ACTIVE_GENERATION_STATUSES } from '@/libs/studio/types';
import type { AuditHandle } from '../audit';
import { db } from '../client';
import { user } from '../schema/auth';
import { generation, studioBudgetOverride, studioModel } from '../schema/studio';
import { isSpending, spentUsd } from './studio';

/**
 * The admin overview's reads over Generations. Admins see spend, failures
 * and what is running, never what a successful Generation was asked for or
 * made: only `failedGenerations` returns inputs, and only of failed ones.
 * Every select names its columns, so nothing private slips in with a row.
 */

const userName = sql<string>`coalesce(${user.displayUsername}, ${user.username}, ${user.name})`;
/** The Model's current name, else the endpoint it ran, for Generations whose Model is gone. */
const modelName = sql<string>`coalesce(${studioModel.name}, ${generation.endpointId})`;

/** Spend per User on Generations created in `[from, to)`, highest first. */
export async function spendByUser(from: Date, to: Date, handle: AuditHandle = db) {
  return handle
    .select({ userId: generation.userId, userName, spentUsd, generations: count() })
    .from(generation)
    .innerJoin(user, eq(user.id, generation.userId))
    .where(and(isSpending, gte(generation.createdAt, from), lt(generation.createdAt, to)))
    .groupBy(generation.userId, user.displayUsername, user.username, user.name)
    .orderBy(desc(spentUsd));
}

/** Spend per Model on Generations created in `[from, to)`, highest first; Template runs count for their Model. */
export async function spendByModel(from: Date, to: Date, handle: AuditHandle = db) {
  return handle
    .select({ modelId: generation.modelId, endpointId: generation.endpointId, modelName, spentUsd, generations: count() })
    .from(generation)
    .leftJoin(studioModel, eq(studioModel.id, generation.modelId))
    .where(and(isSpending, gte(generation.createdAt, from), lt(generation.createdAt, to)))
    .groupBy(generation.modelId, generation.endpointId, studioModel.name)
    .orderBy(desc(spentUsd));
}

/** Spend per UTC calendar month ("2026-11") on Generations created in `[from, to)`; months without spend are left out. */
export async function spendByMonth(from: Date, to: Date, handle: AuditHandle = db) {
  const month = sql<string>`to_char(${generation.createdAt} at time zone 'UTC', 'YYYY-MM')`;
  return handle
    .select({ month, spentUsd, generations: count() })
    .from(generation)
    .where(and(isSpending, gte(generation.createdAt, from), lt(generation.createdAt, to)))
    .groupBy(month);
}

/** Every User with an own Budget; null means unlimited. */
export async function listBudgetOverrides(handle: AuditHandle = db) {
  return handle
    .select({ userId: studioBudgetOverride.userId, userName, monthlyBudgetUsd: studioBudgetOverride.monthlyBudgetUsd })
    .from(studioBudgetOverride)
    .innerJoin(user, eq(user.id, studioBudgetOverride.userId));
}

/** Per Model, how many Generations created since `since` finished, and how many of them failed. */
export async function failureRates(since: Date, handle: AuditHandle = db) {
  return handle
    .select({
      modelId: generation.modelId,
      endpointId: generation.endpointId,
      modelName,
      finished: count(),
      failed: sql<number>`count(*) filter (where ${generation.status} = 'failed')`.mapWith(Number),
    })
    .from(generation)
    .leftJoin(studioModel, eq(studioModel.id, generation.modelId))
    .where(and(inArray(generation.status, ['succeeded', 'failed']), gte(generation.createdAt, since)))
    .groupBy(generation.modelId, generation.endpointId, studioModel.name)
    .orderBy(modelName);
}

/** Waiting and running Generations, oldest first, by who runs which Model or Template. */
export async function runningGenerations(handle: AuditHandle = db) {
  return handle
    .select({
      id: generation.id,
      userId: generation.userId,
      userName,
      name: generation.name,
      endpointId: generation.endpointId,
      status: generation.status,
      createdAt: generation.createdAt,
      startedAt: generation.startedAt,
    })
    .from(generation)
    .innerJoin(user, eq(user.id, generation.userId))
    .where(inArray(generation.status, ACTIVE_GENERATION_STATUSES))
    .orderBy(generation.createdAt);
}

/**
 * The newest failed Generations created since `since`, with what the User
 * entered, what was sent to fal and fal's error. The status filter is what
 * keeps successful inputs out: never widen it.
 */
export async function failedGenerations(since: Date, limit: number, handle: AuditHandle = db) {
  return handle
    .select({
      id: generation.id,
      userId: generation.userId,
      userName,
      name: generation.name,
      endpointId: generation.endpointId,
      formValues: generation.formValues,
      requestInput: generation.requestInput,
      error: generation.error,
      createdAt: generation.createdAt,
    })
    .from(generation)
    .innerJoin(user, eq(user.id, generation.userId))
    .where(and(eq(generation.status, 'failed'), isNull(generation.deletedAt), gte(generation.createdAt, since)))
    .orderBy(desc(generation.createdAt))
    .limit(limit);
}
