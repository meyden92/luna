import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Prisma, PrismaClient } from '../../.prisma/generated/client/client';
import { DiffEngine } from './audit/diff-engine';
import { MetadataCollector } from './audit/metadata-collector';
import { Summarizer } from './audit/summarizer';
import { env } from './env';

const AUDIT_IGNORE_MODELS = ['AuditLog'] as const;

declare global {
  var __prisma: PrismaClient | undefined;
}

function pickModelScalarFields(client: any, model: string, record: any) {
  if (!record || typeof record !== 'object') return null;

  const fields = client?._runtimeDataModel?.models?.[model]?.fields;
  if (!Array.isArray(fields)) return undefined;

  const scalarNames = fields
    .filter((field: { kind: string }) => field.kind === 'scalar' || field.kind === 'enum')
    .map((field: { name: string }) => field.name);
  return Object.fromEntries(
    scalarNames.filter((fieldName: string) => fieldName in record).map((fieldName: string) => [fieldName, record[fieldName]]),
  );
}

async function getAfterSingleSnapshot(
  client: any,
  model: string,
  delegate: any,
  operation: string,
  args: any,
  result: any,
  beforeSingle: any,
) {
  if (!['create', 'update', 'upsert'].includes(operation) || !result || typeof result !== 'object') return null;

  const recordId = (result.id ?? beforeSingle?.id) as string | undefined;
  const usesPartialShape = Boolean(args.select || args.omit);
  if (!usesPartialShape) {
    const scalarSnapshot = pickModelScalarFields(client, model, result);
    if (scalarSnapshot !== undefined) return scalarSnapshot;
  }

  return recordId ? delegate.findUnique({ where: { id: recordId } }) : null;
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { auth } = await import('./auth/auth');
    const user = await auth.api.getSession({
      headers: getRequestHeaders(),
    });
    return user?.user?.id ?? null;
  } catch (_error) {
    return null;
  }
}

function createPrismaClient() {
  const adapter = new PrismaMariaDb(env.DATABASE_URL);
  return new PrismaClient({ adapter });
}

// Lazy initialization - only create the client when first accessed
function getPrismaClient(): PrismaClient {
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient();
  }
  return globalThis.__prisma;
}

// Extended client cache
let extendedPrisma: ReturnType<typeof createExtendedClient> | undefined;

/**
 * Audit-logging extension. Intercepts every write op (create, update,
 * updateMany, delete, deleteMany, upsert) on all models except AuditLog itself.
 *
 * Lifecycle per intercepted op:
 *  1. Before-snapshot: fetch the affected row(s) (findUnique for single ops,
 *     findMany for *Many ops) so the prior state is captured before mutation.
 *  2. Execute the original query.
 *  3. After-snapshot: use the returned row for single create/update/upsert ops,
 *     and re-read updateMany rows by the before-batch ids.
 *  4. Write the audit row(s) from the before/after pair — diffed by DiffEngine
 *     and summarized — keyed to the same changeSet.
 *
 * Invariant: the audit write must never break or alter the underlying query —
 * `result` is captured before any audit work and is what gets returned, so an
 * audit failure surfaces as a thrown error only after the real mutation has
 * already committed, never as a corrupted or rolled-back business write.
 */
const auditExtension = Prisma.defineExtension((client: any) =>
  client.$extends({
    name: 'auditLogging',
    query: {
      $allModels: {
        async $allOperations(params: any) {
          const { model, operation: op, args, query } = params;

          const opsToLog = ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'];
          if (!model || AUDIT_IGNORE_MODELS.includes(model) || !opsToLog.includes(op)) {
            return query(args);
          }

          if (params.__internalParams?.transaction) {
            return query(args);
          }

          const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
          const delegate = (client as any)[delegateName] as any;

          let beforeBatch: any[] = [];
          if ((op === 'deleteMany' || op === 'updateMany') && args.where) {
            beforeBatch = await delegate.findMany({ where: args.where });
          }

          let beforeSingle: any = null;
          if ((op === 'delete' || op === 'update') && args.where) {
            beforeSingle = await delegate.findUnique({ where: args.where });
          }

          const result = await query(args);

          const afterSingle = await getAfterSingleSnapshot(client, model, delegate, op, args, result, beforeSingle);

          let afterBatch: any[] = [];
          if (op === 'updateMany' && beforeBatch.length > 0) {
            const ids = beforeBatch.map((record) => record.id);
            afterBatch = await delegate.findMany({
              where: { id: { in: ids } },
              orderBy: { id: 'asc' },
            });
          }

          const metadata = await MetadataCollector.collectFromRequest();
          const changeSetId = MetadataCollector.generateChangeSetId();
          const userId = await getCurrentUserId();

          if (op === 'deleteMany') {
            // One batched insert instead of a write per affected row.
            if (beforeBatch.length > 0) {
              await client.auditLog.createMany({
                data: beforeBatch.map((row: any) => ({
                  model,
                  action: 'delete',
                  recordId: row.id,
                  userId,
                  before: JSON.parse(JSON.stringify(row)),
                  after: Prisma.DbNull,
                  metadata: metadata || Prisma.DbNull,
                  changeSet: changeSetId,
                  summary: Summarizer.generateActionSummary(model, 'delete', [], row.id),
                  fieldChanges: Prisma.DbNull,
                })),
              });
            }
          } else if (op === 'updateMany') {
            // Pair before/after by id — beforeBatch is unsorted, so index
            // pairing would diff unrelated records.
            const afterById = new Map(afterBatch.map((row: any) => [row.id, row]));
            const entries = beforeBatch
              .map((beforeRecord) => ({ beforeRecord, afterRecord: afterById.get(beforeRecord.id) }))
              .filter(({ beforeRecord, afterRecord }) => beforeRecord && afterRecord)
              .map(({ beforeRecord, afterRecord }) => {
                const diffResult = DiffEngine.generateDiffResult(beforeRecord, afterRecord);
                return {
                  model,
                  action: 'update',
                  recordId: beforeRecord.id,
                  userId,
                  before: JSON.parse(JSON.stringify(beforeRecord)),
                  after: JSON.parse(JSON.stringify(afterRecord)),
                  metadata: metadata || Prisma.DbNull,
                  changeSet: changeSetId,
                  summary: Summarizer.generateActionSummary(model, 'update', diffResult.changes, beforeRecord.id),
                  fieldChanges: diffResult.hasChanges ? diffResult.changes : Prisma.DbNull,
                };
              });
            if (entries.length > 0) {
              await client.auditLog.createMany({ data: entries });
            }
          } else {
            const before = beforeSingle;
            const after = afterSingle;
            const recordId = ((after ?? before)?.id as string) ?? '';
            const diffResult = DiffEngine.generateDiffResult(before, after);

            await client.auditLog.create({
              data: {
                model,
                action: op === 'upsert' ? 'update' : op,
                recordId,
                userId,
                before: before ? JSON.parse(JSON.stringify(before)) : Prisma.DbNull,
                after: after ? JSON.parse(JSON.stringify(after)) : Prisma.DbNull,
                metadata: metadata || Prisma.DbNull,
                changeSet: changeSetId,
                summary: Summarizer.generateActionSummary(model, op === 'upsert' ? 'update' : op, diffResult.changes, recordId),
                fieldChanges: diffResult.hasChanges ? diffResult.changes : Prisma.DbNull,
              },
            });
          }
          return result;
        },
      },
    },
  }),
);

function createExtendedClient() {
  return getPrismaClient().$extends(auditExtension);
}

function getExtendedPrisma() {
  if (!extendedPrisma) {
    extendedPrisma = createExtendedClient();
  }
  return extendedPrisma;
}

// Lazy proxy for the extended prisma client
const prisma = new Proxy({} as ReturnType<typeof createExtendedClient>, {
  get(_, prop) {
    return getExtendedPrisma()[prop as keyof ReturnType<typeof createExtendedClient>];
  },
});

// Lazy proxy for the base prisma client
const prismaBase = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return getPrismaClient()[prop as keyof PrismaClient];
  },
});

export default prisma;
export const prismabase = prismaBase;
