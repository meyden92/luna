import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  type AuditCursor,
  getAuditLogById,
  listRelatedAuditLogs,
  listAuditLogs as queryAuditLogs,
  listAuditModels as queryAuditModels,
} from '@/db/queries/admin';
import { appMiddleware } from '@/server/server-fn';

const listAuditLogsSchema = z.object({
  model: z.string().optional(),
  recordId: z.string().optional(),
  search: z.string().optional(),
  action: z.string().optional(),
  cursor: z.string().optional(),
  direction: z.enum(['next', 'previous']).optional(),
  pageSize: z.number().int().min(1).max(200).default(20),
});

const RELATED_AUDIT_LOG_LIMIT = 50;
const AUDIT_CURSOR_SEPARATOR = '|';

function encodeAuditCursor(log: AuditCursor) {
  return `${log.timestamp.toISOString()}${AUDIT_CURSOR_SEPARATOR}${log.id}`;
}

function parseAuditCursor(cursor?: string): AuditCursor | null {
  if (!cursor) return null;

  const separatorIndex = cursor.indexOf(AUDIT_CURSOR_SEPARATOR);
  if (separatorIndex === -1) throw new Error('Invalid audit cursor');

  const timestamp = new Date(cursor.slice(0, separatorIndex));
  const id = cursor.slice(separatorIndex + 1);
  if (Number.isNaN(timestamp.getTime()) || !id) throw new Error('Invalid audit cursor');

  return { timestamp, id };
}

function buildAuditPage<T extends AuditCursor>(rows: T[], pageSize: number, cursor: AuditCursor | null, direction: 'next' | 'previous') {
  const hasExtra = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const logs = direction === 'previous' ? pageRows.reverse() : pageRows;
  const firstLog = logs[0];
  const lastLog = logs[logs.length - 1];
  const hasMore = direction === 'previous' ? Boolean(cursor) : hasExtra;
  const hasPrevious = direction === 'previous' ? hasExtra : Boolean(cursor);

  return {
    logs,
    hasMore,
    hasPrevious,
    nextCursor: hasMore && lastLog ? encodeAuditCursor(lastLog) : null,
    previousCursor: hasPrevious && firstLog ? encodeAuditCursor(firstLog) : null,
  };
}

export const listAuditModels = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    const models = await queryAuditModels();
    return models.map((m) => m.model);
  });

export const listAuditLogs = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(listAuditLogsSchema)
  .handler(async ({ data }) => {
    const direction = data.direction ?? 'next';
    const cursor = parseAuditCursor(data.cursor);
    const logs = await queryAuditLogs({
      model: data.model,
      recordId: data.recordId,
      action: data.action,
      search: data.search,
      cursor,
      direction,
      // One extra row is what tells the pager whether another page exists.
      limit: data.pageSize + 1,
    });
    const page = buildAuditPage(logs, data.pageSize, cursor, direction);

    return {
      logs: JSON.parse(JSON.stringify(page.logs)),
      hasMore: page.hasMore,
      hasPrevious: page.hasPrevious,
      nextCursor: page.nextCursor,
      previousCursor: page.previousCursor,
    };
  });

export const getAuditLog = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const auditLog = await getAuditLogById(data.id);
    if (!auditLog) throw new Error('Audit log not found');

    let relatedAuditLogs = await listRelatedAuditLogs({
      model: auditLog.model,
      recordId: auditLog.recordId,
      limit: RELATED_AUDIT_LOG_LIMIT,
    });
    if (!relatedAuditLogs.some((log) => log.id === auditLog.id)) {
      relatedAuditLogs = [...relatedAuditLogs, auditLog].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime() || b.id.localeCompare(a.id),
      );
    }

    return {
      auditLog: JSON.parse(JSON.stringify(auditLog)),
      relatedAuditLogs: JSON.parse(JSON.stringify(relatedAuditLogs)),
    };
  });
